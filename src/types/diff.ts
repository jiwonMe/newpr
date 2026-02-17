import type { FileStatus } from "./output.ts";

export interface DiffHunk {
	old_start: number;
	old_count: number;
	new_start: number;
	new_count: number;
	content: string;
}

export interface FileDiff {
	path: string;
	old_path: string | null;
	status: FileStatus;
	additions: number;
	deletions: number;
	is_binary: boolean;
	hunks: DiffHunk[];
	raw: string;
}

export interface ParsedDiff {
	files: FileDiff[];
	total_additions: number;
	total_deletions: number;
}

export interface DiffChunk {
	file_path: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	is_binary: boolean;
	diff_content: string;
	estimated_tokens: number;
}
