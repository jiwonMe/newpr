import type { StackExecResult } from "./types.ts";

export interface VerifyInput {
	repo_path: string;
	base_sha: string;
	head_sha: string;
	exec_result: StackExecResult;
	ownership: Map<string, string>;
}

export interface VerifyResult {
	verified: boolean;
	errors: string[];
	warnings: string[];
}

export async function verifyStack(input: VerifyInput): Promise<VerifyResult> {
	const { repo_path, base_sha, head_sha, exec_result, ownership } = input;
	const errors: string[] = [];
	const warnings: string[] = [];

	await verifyPerGroupDiffScope(repo_path, base_sha, exec_result, ownership, warnings);
	await verifyUnionCompleteness(repo_path, base_sha, head_sha, exec_result, warnings);
	await verifyFinalTreeEquivalence(repo_path, head_sha, exec_result, errors);

	return {
		verified: errors.length === 0,
		errors,
		warnings,
	};
}

async function verifyPerGroupDiffScope(
	repoPath: string,
	baseSha: string,
	execResult: StackExecResult,
	ownership: Map<string, string>,
	warnings: string[],
): Promise<void> {
	let prevCommitSha = baseSha;

	for (const gc of execResult.group_commits) {
		const diffResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z --no-commit-id ${prevCommitSha} ${gc.commit_sha}`.quiet().nothrow();

		if (diffResult.exitCode !== 0) {
			warnings.push(`Failed to diff group "${gc.group_id}": ${diffResult.stderr.toString().trim()}`);
			prevCommitSha = gc.commit_sha;
			continue;
		}

		const changedPaths = extractPathsFromRawDiff(diffResult.stdout);

		for (const path of changedPaths) {
			const fileOwner = ownership.get(path);
			if (fileOwner !== gc.group_id) {
				warnings.push(
					`Group "${gc.group_id}" diff contains file "${path}" owned by "${fileOwner ?? "unassigned"}"`,
				);
			}
		}

		prevCommitSha = gc.commit_sha;
	}
}

async function verifyUnionCompleteness(
	repoPath: string,
	baseSha: string,
	headSha: string,
	execResult: StackExecResult,
	warnings: string[],
): Promise<void> {
	const expectedResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z --no-commit-id ${baseSha} ${headSha}`.quiet().nothrow();

	if (expectedResult.exitCode !== 0) {
		warnings.push(`Failed to get expected diff: ${expectedResult.stderr.toString().trim()}`);
		return;
	}

	const expectedPaths = new Set(extractPathsFromRawDiff(expectedResult.stdout));

	const actualPaths = new Set<string>();
	let prevSha = baseSha;
	for (const gc of execResult.group_commits) {
		const diffResult = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z --no-commit-id ${prevSha} ${gc.commit_sha}`.quiet().nothrow();

		if (diffResult.exitCode === 0) {
			for (const path of extractPathsFromRawDiff(diffResult.stdout)) {
				actualPaths.add(path);
			}
		}
		prevSha = gc.commit_sha;
	}

	for (const path of expectedPaths) {
		if (!actualPaths.has(path)) {
			warnings.push(`File "${path}" present in original diff but missing from stack`);
		}
	}

	for (const path of actualPaths) {
		if (!expectedPaths.has(path)) {
			warnings.push(`File "${path}" present in stack but not in original diff`);
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
