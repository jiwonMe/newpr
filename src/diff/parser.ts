import type { DiffHunk, FileDiff, ParsedDiff } from "../types/diff.ts";
import type { FileStatus } from "../types/output.ts";

function detectStatus(headerLines: string[]): FileStatus {
	for (const line of headerLines) {
		if (line.startsWith("new file mode")) return "added";
		if (line.startsWith("deleted file mode")) return "deleted";
		if (line.startsWith("rename from") || line.startsWith("rename to")) return "renamed";
	}
	return "modified";
}

function extractPaths(
	headerLines: string[],
	diffLine: string,
): { path: string; oldPath: string | null } {
	const diffMatch = diffLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
	const aPath = diffMatch?.[1] ?? "";
	const bPath = diffMatch?.[2] ?? "";

	let renameTo: string | null = null;
	let renameFrom: string | null = null;
	for (const line of headerLines) {
		if (line.startsWith("rename from ")) renameFrom = line.slice("rename from ".length);
		if (line.startsWith("rename to ")) renameTo = line.slice("rename to ".length);
	}

	if (renameTo) {
		return { path: renameTo, oldPath: renameFrom };
	}
	return { path: bPath || aPath, oldPath: aPath !== bPath ? aPath : null };
}

function parseHunks(lines: string[]): { hunks: DiffHunk[]; additions: number; deletions: number } {
	const hunks: DiffHunk[] = [];
	let additions = 0;
	let deletions = 0;
	let currentHunk: { old_start: number; old_count: number; new_start: number; new_count: number; lines: string[] } | null = null;

	for (const line of lines) {
		const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
		if (hunkMatch) {
			if (currentHunk) {
				hunks.push({ ...currentHunk, content: currentHunk.lines.join("\n") });
			}
			currentHunk = {
				old_start: Number(hunkMatch[1]),
				old_count: Number(hunkMatch[2] ?? "1"),
				new_start: Number(hunkMatch[3]),
				new_count: Number(hunkMatch[4] ?? "1"),
				lines: [line],
			};
			continue;
		}

		if (currentHunk) {
			currentHunk.lines.push(line);
			if (line.startsWith("+") && !line.startsWith("+++")) additions++;
			if (line.startsWith("-") && !line.startsWith("---")) deletions++;
		}
	}

	if (currentHunk) {
		hunks.push({ ...currentHunk, content: currentHunk.lines.join("\n") });
	}

	return { hunks, additions, deletions };
}

export function parseDiff(rawDiff: string): ParsedDiff {
	if (!rawDiff.trim()) {
		return { files: [], total_additions: 0, total_deletions: 0 };
	}

	const files: FileDiff[] = [];
	const fileSections = rawDiff.split(/(?=^diff --git )/m);

	for (const section of fileSections) {
		if (!section.startsWith("diff --git ")) continue;

		const lines = section.split("\n");
		const diffLine = lines[0]!;

		const headerEndIdx = lines.findIndex(
			(l, i) => i > 0 && (l.startsWith("@@") || l.startsWith("Binary")),
		);
		const headerLines = headerEndIdx > 0 ? lines.slice(1, headerEndIdx) : lines.slice(1);

		const isBinary =
			lines.some((l) => l.startsWith("Binary files") || l.includes("GIT binary patch"));

		const status = detectStatus(headerLines);
		const { path, oldPath } = extractPaths(headerLines, diffLine);

		const bodyLines = headerEndIdx > 0 ? lines.slice(headerEndIdx) : [];
		const { hunks, additions, deletions } = isBinary
			? { hunks: [], additions: 0, deletions: 0 }
			: parseHunks(bodyLines);

		files.push({
			path,
			old_path: oldPath,
			status,
			additions,
			deletions,
			is_binary: isBinary,
			hunks,
			raw: section,
		});
	}

	const total_additions = files.reduce((sum, f) => sum + f.additions, 0);
	const total_deletions = files.reduce((sum, f) => sum + f.deletions, 0);

	return { files, total_additions, total_deletions };
}
