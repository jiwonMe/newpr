import { test, expect, describe } from "bun:test";
import { extractDiffStats } from "../../src/diff/stats.ts";
import type { ParsedDiff } from "../../src/types/diff.ts";

describe("extractDiffStats", () => {
	test("returns zeros for empty diff", () => {
		const empty: ParsedDiff = { files: [], total_additions: 0, total_deletions: 0 };
		const stats = extractDiffStats(empty);

		expect(stats.total_files).toBe(0);
		expect(stats.total_additions).toBe(0);
		expect(stats.total_deletions).toBe(0);
		expect(stats.largest_file).toBeNull();
		expect(stats.files_by_status.added).toBe(0);
	});

	test("counts files by status", () => {
		const parsed: ParsedDiff = {
			files: [
				{ path: "a.ts", old_path: null, status: "added", additions: 5, deletions: 0, is_binary: false, hunks: [], raw: "" },
				{ path: "b.ts", old_path: null, status: "modified", additions: 2, deletions: 1, is_binary: false, hunks: [], raw: "" },
				{ path: "c.ts", old_path: null, status: "deleted", additions: 0, deletions: 10, is_binary: false, hunks: [], raw: "" },
				{ path: "d.ts", old_path: "old.ts", status: "renamed", additions: 1, deletions: 1, is_binary: false, hunks: [], raw: "" },
			],
			total_additions: 8,
			total_deletions: 12,
		};

		const stats = extractDiffStats(parsed);

		expect(stats.total_files).toBe(4);
		expect(stats.total_additions).toBe(8);
		expect(stats.total_deletions).toBe(12);
		expect(stats.files_by_status.added).toBe(1);
		expect(stats.files_by_status.modified).toBe(1);
		expect(stats.files_by_status.deleted).toBe(1);
		expect(stats.files_by_status.renamed).toBe(1);
	});

	test("identifies the largest file", () => {
		const parsed: ParsedDiff = {
			files: [
				{ path: "small.ts", old_path: null, status: "modified", additions: 2, deletions: 1, is_binary: false, hunks: [], raw: "" },
				{ path: "large.ts", old_path: null, status: "modified", additions: 50, deletions: 30, is_binary: false, hunks: [], raw: "" },
				{ path: "medium.ts", old_path: null, status: "modified", additions: 10, deletions: 5, is_binary: false, hunks: [], raw: "" },
			],
			total_additions: 62,
			total_deletions: 36,
		};

		const stats = extractDiffStats(parsed);

		expect(stats.largest_file).toEqual({ path: "large.ts", changes: 80 });
	});
});
