import type { ParsedDiff } from "../types/diff.ts";
import type { FileStatus } from "../types/output.ts";

export interface DiffStats {
	total_files: number;
	total_additions: number;
	total_deletions: number;
	files_by_status: Record<FileStatus, number>;
	largest_file: { path: string; changes: number } | null;
}

export function extractDiffStats(parsed: ParsedDiff): DiffStats {
	const filesByStatus: Record<FileStatus, number> = {
		added: 0,
		modified: 0,
		deleted: 0,
		renamed: 0,
	};

	let largest: { path: string; changes: number } | null = null;

	for (const file of parsed.files) {
		filesByStatus[file.status]++;
		const changes = file.additions + file.deletions;
		if (!largest || changes > largest.changes) {
			largest = { path: file.path, changes };
		}
	}

	return {
		total_files: parsed.files.length,
		total_additions: parsed.total_additions,
		total_deletions: parsed.total_deletions,
		files_by_status: filesByStatus,
		largest_file: largest,
	};
}
