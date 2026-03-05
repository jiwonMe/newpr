import type { StackExecResult, StackWarning } from "./types.ts";

export interface VerifyInput {
	repo_path: string;
	base_sha: string;
	head_sha: string;
	exec_result: StackExecResult;
	ownership: Map<string, string>;
	group_deps?: Map<string, string[]>;
}

export interface VerifyResult {
	verified: boolean;
	errors: string[];
	warnings: string[];
	structured_warnings: StackWarning[];
}

export async function verifyStack(input: VerifyInput): Promise<VerifyResult> {
	const { repo_path, base_sha, head_sha, exec_result, ownership, group_deps } = input;
	const errors: string[] = [];
	const warnings: string[] = [];
	const structuredWarnings: StackWarning[] = [];

	const scopeLeaks: string[] = [];
	const unionMissing: string[] = [];
	const unionExtra: string[] = [];

	await verifyPerGroupDiffScope(repo_path, base_sha, exec_result, ownership, group_deps ?? new Map(), warnings, scopeLeaks);
	await verifyUnionCompleteness(repo_path, base_sha, head_sha, exec_result, warnings, unionMissing, unionExtra);
	await verifyFinalTreeEquivalence(repo_path, head_sha, exec_result, errors);

	if (scopeLeaks.length > 0) {
		structuredWarnings.push({
			category: "verification.scope",
			severity: "warn",
			title: `${scopeLeaks.length} file(s) appear in wrong group's diff`,
			message: "Some files changed in a group's commit but are owned by a different group — usually harmless with merge commits",
			details: scopeLeaks,
		});
	}
	if (unionMissing.length > 0) {
		structuredWarnings.push({
			category: "verification.completeness",
			severity: "warn",
			title: `${unionMissing.length} file(s) in original diff but missing from stack`,
			message: "These files were changed in the original PR but don't appear in the stacked commits",
			details: unionMissing,
		});
	}
	if (unionExtra.length > 0) {
		structuredWarnings.push({
			category: "verification.completeness",
			severity: "warn",
			title: `${unionExtra.length} extra file(s) in stack not in original diff`,
			message: "The stacked commits touch files not in the original PR diff — usually transient changes from merge commits",
			details: unionExtra,
		});
	}

	return {
		verified: errors.length === 0,
		errors,
		warnings,
		structured_warnings: structuredWarnings,
	};
}

async function verifyPerGroupDiffScope(
	repoPath: string,
	baseSha: string,
	execResult: StackExecResult,
	ownership: Map<string, string>,
	groupDeps: Map<string, string[]>,
	warnings: string[],
	scopeLeaks: string[],
): Promise<void> {
	const commitByGroupId = new Map<string, string>();
	for (const gc of execResult.group_commits) {
		commitByGroupId.set(gc.group_id, gc.commit_sha);
	}

	for (const gc of execResult.group_commits) {
		const parentTree = await resolveScopeParentTree(repoPath, baseSha, gc.group_id, groupDeps, commitByGroupId);
		if (!parentTree) {
			warnings.push(`Failed to resolve parent tree for group "${gc.group_id}"`);
			continue;
		}

		const diffResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z --no-commit-id ${parentTree} ${gc.tree_sha}`.quiet().nothrow();

		if (diffResult.exitCode !== 0) {
			warnings.push(`Failed to diff group "${gc.group_id}": ${diffResult.stderr.toString().trim()}`);
			continue;
		}

		const changedPaths = extractPathsFromRawDiff(diffResult.stdout);

		for (const path of changedPaths) {
			const fileOwner = ownership.get(path);
			if (fileOwner !== gc.group_id) {
				warnings.push(
					`Group "${gc.group_id}" diff contains file "${path}" owned by "${fileOwner ?? "unassigned"}"`,
				);
				scopeLeaks.push(`"${path}" in "${gc.group_id}" diff, owned by "${fileOwner ?? "unassigned"}"`);
			}
		}
	}
}

async function resolveScopeParentTree(
	repoPath: string,
	baseSha: string,
	groupId: string,
	groupDeps: Map<string, string[]>,
	commitByGroupId: Map<string, string>,
): Promise<string | null> {
	const deps = groupDeps.get(groupId) ?? [];
	if (deps.length === 0) {
		return resolveTreeForRef(repoPath, baseSha);
	}

	const parentCommits: string[] = [];
	for (const dep of deps) {
		const depCommit = commitByGroupId.get(dep);
		if (!depCommit) continue;
		parentCommits.push(depCommit);
	}

	if (parentCommits.length === 0) return resolveTreeForRef(repoPath, baseSha);
	if (parentCommits.length === 1) return resolveTreeForRef(repoPath, parentCommits[0]!);

	let mergedCommit = parentCommits[0]!;
	let mergedTree: string | null = null;
	for (let i = 1; i < parentCommits.length; i++) {
		const nextParentCommit = parentCommits[i]!;
		const mergeResult = await Bun.$`git -C ${repoPath} merge-tree --write-tree --allow-unrelated-histories ${mergedCommit} ${nextParentCommit}`.quiet().nothrow();
		if (mergeResult.exitCode !== 0) return null;
		const nextTree = mergeResult.stdout.toString().trim().split("\n")[0]?.trim();
		if (!nextTree) return null;
		mergedTree = nextTree;

		const mergedCommitResult = await Bun.$`git -C ${repoPath} commit-tree ${mergedTree} -p ${mergedCommit} -p ${nextParentCommit} -m "newpr synthetic verify merged parent"`.quiet().nothrow();
		if (mergedCommitResult.exitCode !== 0) return null;
		mergedCommit = mergedCommitResult.stdout.toString().trim();
		if (!mergedCommit) return null;
	}

	if (!mergedTree) return resolveTreeForRef(repoPath, mergedCommit);
	return mergedTree;
}

async function resolveTreeForRef(repoPath: string, ref: string): Promise<string | null> {
	const result = await Bun.$`git -C ${repoPath} rev-parse ${ref}^{tree}`.quiet().nothrow();
	if (result.exitCode !== 0) return null;
	const tree = result.stdout.toString().trim();
	return tree.length > 0 ? tree : null;
}

async function verifyUnionCompleteness(
	repoPath: string,
	baseSha: string,
	headSha: string,
	execResult: StackExecResult,
	warnings: string[],
	unionMissing: string[],
	unionExtra: string[],
): Promise<void> {
	const expectedResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z --no-commit-id ${baseSha} ${headSha}`.quiet().nothrow();

	if (expectedResult.exitCode !== 0) {
		warnings.push(`Failed to get expected diff: ${expectedResult.stderr.toString().trim()}`);
		return;
	}

	const expectedPaths = new Set(extractPathsFromRawDiff(expectedResult.stdout));

	const baseTreeResult = await Bun.$`git -C ${repoPath} rev-parse ${baseSha}^{tree}`.quiet().nothrow();
	if (baseTreeResult.exitCode !== 0) {
		warnings.push(`Failed to get base tree: ${baseTreeResult.stderr.toString().trim()}`);
		return;
	}
	const baseTree = baseTreeResult.stdout.toString().trim();
	const finalTree = execResult.final_tree_sha;
	if (!finalTree) return;

	const actualResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z ${baseTree} ${finalTree}`.quiet().nothrow();
	const actualPaths = actualResult.exitCode === 0
		? new Set(extractPathsFromRawDiff(actualResult.stdout))
		: new Set<string>();

	for (const path of expectedPaths) {
		if (!actualPaths.has(path)) {
			warnings.push(`File "${path}" present in original diff but missing from stack`);
			unionMissing.push(path);
		}
	}

	for (const path of actualPaths) {
		if (!expectedPaths.has(path)) {
			warnings.push(`File "${path}" present in stack but not in original diff`);
			unionExtra.push(path);
		}
	}
}

async function verifyFinalTreeEquivalence(
	repoPath: string,
	headSha: string,
	execResult: StackExecResult,
	errors: string[],
): Promise<void> {
	const headTreeResult = await Bun.$`git -C ${repoPath} rev-parse ${headSha}^{tree}`.quiet().nothrow();

	if (headTreeResult.exitCode !== 0) {
		errors.push(`Failed to get HEAD tree: ${headTreeResult.stderr.toString().trim()}`);
		return;
	}

	const headTree = headTreeResult.stdout.toString().trim();

	if (execResult.final_tree_sha !== headTree) {
		errors.push(
			`Final tree mismatch: stack top = ${execResult.final_tree_sha}, HEAD = ${headTree}`,
		);
	}
}

function extractPathsFromRawDiff(output: Buffer): string[] {
	const paths: string[] = [];
	const entries = output.toString("utf-8").split("\0").filter((s) => s.length > 0);

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		if (!entry.startsWith(":")) continue;

		const match = entry.match(/^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([AMDRC])(\d*)$/);
		if (!match) continue;

		const status = match[5];
		const pathEntry = entries[i + 1];
		if (!pathEntry) continue;
		i++;

		if (status === "R") {
			const newPath = entries[i + 1];
			if (newPath) {
				paths.push(newPath);
				i++;
			}
		} else {
			paths.push(pathEntry);
		}
	}

	return paths;
}
