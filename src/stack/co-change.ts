import type { DeltaEntry } from "./types.ts";

export interface CoChangeResult {
	pairs: Map<string, number>;
	totalCommits: number;
}

export function buildCoChangePairs(deltas: DeltaEntry[]): CoChangeResult {
	const pairs = new Map<string, number>();

	for (const delta of deltas) {
		const files = delta.changes.map((c) => c.path);
		for (let i = 0; i < files.length; i++) {
			for (let j = i + 1; j < files.length; j++) {
				const key = [files[i]!, files[j]!].sort().join("|||");
				pairs.set(key, (pairs.get(key) ?? 0) + 1);
			}
		}
	}

	return { pairs, totalCommits: deltas.length };
}

export async function buildHistoricalCoChangePairs(
	repoPath: string,
	filePaths: string[],
	maxCommits = 200,
): Promise<CoChangeResult> {
	if (filePaths.length === 0) return { pairs: new Map(), totalCommits: 0 };

	const result = await Bun.$`git -C ${repoPath} log --name-only --pretty=format:"%H" -n ${maxCommits} -- ${filePaths}`.quiet().nothrow();
	if (result.exitCode !== 0) return { pairs: new Map(), totalCommits: 0 };

	const fileSet = new Set(filePaths);
	const lines = result.stdout.toString().split("\n");
	const pairs = new Map<string, number>();
	let totalCommits = 0;
	let currentFiles: string[] = [];

	const flushCommit = () => {
		if (currentFiles.length < 2) return;
		for (let i = 0; i < currentFiles.length; i++) {
			for (let j = i + 1; j < currentFiles.length; j++) {
				const key = [currentFiles[i]!, currentFiles[j]!].sort().join("|||");
				pairs.set(key, (pairs.get(key) ?? 0) + 1);
			}
		}
		totalCommits++;
		currentFiles = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (/^[0-9a-f]{40}$/i.test(trimmed)) {
			flushCommit();
		} else if (fileSet.has(trimmed)) {
			currentFiles.push(trimmed);
		}
	}
	flushCommit();

	return { pairs, totalCommits };
}
