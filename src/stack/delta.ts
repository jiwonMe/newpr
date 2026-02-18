import type { DeltaEntry, DeltaFileChange, DeltaStatus } from "./types.ts";

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

		await checkPreconditions(repoPath, sha);

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

async function checkPreconditions(
	repoPath: string,
	sha: string,
): Promise<void> {
	const result = await Bun.$`git -C ${repoPath} rev-list --parents -n 1 ${sha}`
		.quiet()
		.nothrow();

	if (result.exitCode !== 0) {
		throw new DeltaExtractionError(
			`Failed to check commit parents: ${result.stderr.toString().trim()}`,
		);
	}

	const parents = result.stdout.toString().trim().split(" ");

	if (parents.length > 2) {
		throw new DeltaExtractionError(
			`Merge commit detected (${sha}). Please rebase to linear history before stacking.`,
		);
	}
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
