import type { DeltaEntry, DeltaFileChange, DeltaStatus, StackGroupStats } from "./types.ts";

export class DeltaExtractionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DeltaExtractionError";
	}
}

export async function extractDeltas(
	repoPath: string,
	baseSha: string,
	headSha: string,
): Promise<DeltaEntry[]> {
	const commitList = await getCommitList(repoPath, baseSha, headSha);
	const deltas: DeltaEntry[] = [];

	for (let i = 0; i < commitList.length; i++) {
		const sha = commitList[i];
		if (!sha) continue;

		const parentSha = i === 0 ? baseSha : commitList[i - 1];
		if (!parentSha) continue;

		const changes = await extractCommitChanges(repoPath, parentSha, sha);
		const metadata = await getCommitMetadata(repoPath, sha);

		deltas.push({
			sha,
			parent_sha: parentSha,
			author: metadata.author,
			date: metadata.date,
			message: metadata.message,
			changes,
		});
	}

	return deltas;
}

async function getCommitList(
	repoPath: string,
	baseSha: string,
	headSha: string,
): Promise<string[]> {
	const result = await Bun.$`git -C ${repoPath} rev-list --first-parent --reverse ${baseSha}..${headSha}`
		.quiet()
		.nothrow();

	if (result.exitCode !== 0) {
		throw new DeltaExtractionError(
			`Failed to get commit list: ${result.stderr.toString().trim()}`,
		);
	}

	return result.stdout
		.toString()
		.trim()
		.split("\n")
		.filter((line) => line.length > 0);
}

async function getCommitMetadata(
	repoPath: string,
	sha: string,
): Promise<{ author: string; date: string; message: string }> {
	const result = await Bun.$`git -C ${repoPath} show -s --format=%an%n%aI%n%s ${sha}`
		.quiet()
		.nothrow();

	if (result.exitCode !== 0) {
		throw new DeltaExtractionError(
			`Failed to get commit metadata: ${result.stderr.toString().trim()}`,
		);
	}

	const lines = result.stdout.toString().trim().split("\n");
	return {
		author: lines[0] || "Unknown",
		date: lines[1] || new Date().toISOString(),
		message: lines[2] || "",
	};
}

async function extractCommitChanges(
	repoPath: string,
	parentSha: string,
	commitSha: string,
): Promise<DeltaFileChange[]> {
	const result = await Bun.$`git -C ${repoPath} diff-tree -r --raw -z -M --no-commit-id --no-textconv --no-ext-diff ${parentSha} ${commitSha}`
		.quiet()
		.nothrow();

	if (result.exitCode !== 0) {
		throw new DeltaExtractionError(
			`Failed to extract changes: ${result.stderr.toString().trim()}`,
		);
	}

	return parseDiffTreeOutput(result.stdout);
}

function parseDiffTreeOutput(output: Buffer): DeltaFileChange[] {
	const changes: DeltaFileChange[] = [];
	const entries = output.toString("utf-8").split("\0").filter((s) => s.length > 0);

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		if (!entry.startsWith(":")) continue;

		const match = entry.match(
			/^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([AMDRC])(\d*)$/,
		);

		if (!match) continue;

		const oldMode = match[1];
		const newMode = match[2];
		const oldBlob = match[3];
		const newBlob = match[4];
		const statusChar = match[5];
		const pathInfo = entries[i + 1];

		if (!oldMode || !newMode || !oldBlob || !newBlob || !statusChar || !pathInfo) {
			continue;
		}

		const status = statusChar as DeltaStatus;
		i++;

		checkForUnsupportedModes(oldMode, newMode, pathInfo);

		if (status === "R") {
			const oldPath = pathInfo;
			const newPath = entries[i + 1];
			if (!newPath) continue;
			i++;

			changes.push({
				status,
				path: newPath,
				old_path: oldPath,
				old_blob: oldBlob,
				new_blob: newBlob,
				old_mode: oldMode,
				new_mode: newMode,
			});
		} else {
			changes.push({
				status,
				path: pathInfo,
				old_blob: oldBlob,
				new_blob: newBlob,
				old_mode: oldMode,
				new_mode: newMode,
			});
		}
	}

	return changes;
}

function checkForUnsupportedModes(
	oldMode: string,
	newMode: string,
	path: string,
): void {
	const modes = [oldMode, newMode];

	for (const mode of modes) {
		if (mode === "160000") {
			throw new DeltaExtractionError(
				`Submodule detected at "${path}". Submodules are not supported in v1.`,
			);
		}

		if (mode === "120000") {
			throw new DeltaExtractionError(
				`Symlink detected at "${path}". Symlinks are not supported in v1.`,
			);
		}
	}
}

async function resolveParentTree(
	repoPath: string,
	baseSha: string,
	gid: string,
	expectedTrees: Map<string, string>,
	dagParents: Map<string, string[]>,
): Promise<string | null> {
	const parentIds = dagParents.get(gid) ?? [];

	if (parentIds.length === 0) {
		return resolveTree(repoPath, baseSha);
	}

	if (parentIds.length === 1) {
		return expectedTrees.get(parentIds[0]!) ?? resolveTree(repoPath, baseSha);
	}

	const parentTrees = parentIds.map((p) => expectedTrees.get(p)).filter((t): t is string => Boolean(t));
	if (parentTrees.length === 0) return resolveTree(repoPath, baseSha);
	if (parentTrees.length === 1) return parentTrees[0]!;

	let mergedTree = parentTrees[0]!;
	for (let i = 1; i < parentTrees.length; i++) {
		const mergeResult = await Bun.$`git -C ${repoPath} merge-tree --write-tree --allow-unrelated-histories ${mergedTree} ${parentTrees[i]!}`.quiet().nothrow();
		if (mergeResult.exitCode === 0) {
			mergedTree = mergeResult.stdout.toString().trim().split("\n")[0]!.trim();
		}
	}

	return mergedTree;
}

export async function computeGroupStats(
	repoPath: string,
	baseSha: string,
	orderedGroupIds: string[],
	expectedTrees: Map<string, string>,
	dagParents?: Map<string, string[]>,
): Promise<Map<string, StackGroupStats>> {
	const stats = new Map<string, StackGroupStats>();
	const linearParents = new Map<string, string[]>(
		orderedGroupIds.map((gid, i) => [gid, i === 0 ? [] : [orderedGroupIds[i - 1]!]]),
	);
	const effectiveDagParents = dagParents ?? linearParents;

	for (let i = 0; i < orderedGroupIds.length; i++) {
		const gid = orderedGroupIds[i]!;
		const tree = expectedTrees.get(gid);
		if (!tree) continue;

		const prevTree = await resolveParentTree(repoPath, baseSha, gid, expectedTrees, effectiveDagParents);
		if (!prevTree) continue;

		const numstatResult = await Bun.$`git -C ${repoPath} diff-tree --numstat -r ${prevTree} ${tree}`.quiet().nothrow();
		const rawResult = await Bun.$`git -C ${repoPath} diff-tree --raw --no-commit-id -r -z ${prevTree} ${tree}`.quiet().nothrow();

		let additions = 0;
		let deletions = 0;
		let filesAdded = 0;
		let filesModified = 0;
		let filesDeleted = 0;

		if (numstatResult.exitCode === 0) {
			const lines = numstatResult.stdout.toString().trim().split("\n").filter(Boolean);
			for (const line of lines) {
				const parts = line.split("\t");
				if (parts.length < 3) continue;
				const [addStr, delStr] = parts;
				if (addStr === "-" || delStr === "-") continue;
				additions += parseInt(addStr!, 10);
				deletions += parseInt(delStr!, 10);
			}
		}

		if (rawResult.exitCode === 0) {
			const entries = rawResult.stdout.toString("utf-8").split("\0").filter(Boolean);
			for (const entry of entries) {
				if (!entry.startsWith(":")) continue;
				const match = entry.match(/^:\d+ \d+ [0-9a-f]+ [0-9a-f]+ ([AMDRC])/);
				if (!match) continue;
				const status = match[1];
				if (status === "A") filesAdded++;
				else if (status === "D") filesDeleted++;
				else filesModified++;
			}
		}

		stats.set(gid, { additions, deletions, files_added: filesAdded, files_modified: filesModified, files_deleted: filesDeleted });
	}

	return stats;
}

async function resolveTree(repoPath: string, commitSha: string): Promise<string> {
	const result = await Bun.$`git -C ${repoPath} rev-parse ${commitSha}^{tree}`.quiet().nothrow();
	if (result.exitCode !== 0) {
		throw new DeltaExtractionError(`Failed to resolve tree for ${commitSha}: ${result.stderr.toString().trim()}`);
	}
	return result.stdout.toString().trim();
}

export function buildRenameMap(deltas: DeltaEntry[]): Map<string, string> {
	const renameMap = new Map<string, string>();

	for (const delta of deltas) {
		for (const change of delta.changes) {
			if (change.status === "R" && change.old_path) {
				renameMap.set(change.old_path, change.path);
			}
		}
	}

	return renameMap;
}
