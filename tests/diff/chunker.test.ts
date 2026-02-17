import { test, expect, describe } from "bun:test";
import { chunkDiff } from "../../src/diff/chunker.ts";
import type { ParsedDiff } from "../../src/types/diff.ts";

function makeParsedDiff(rawContent: string, additions = 1, deletions = 0): ParsedDiff {
	return {
		files: [
			{
				path: "test.ts",
				old_path: null,
				status: "modified",
				additions,
				deletions,
				is_binary: false,
				hunks: [],
				raw: rawContent,
			},
		],
		total_additions: additions,
		total_deletions: deletions,
	};
}

describe("chunkDiff", () => {
	test("creates one chunk per file", () => {
		const parsed: ParsedDiff = {
			files: [
				{ path: "a.ts", old_path: null, status: "modified", additions: 1, deletions: 0, is_binary: false, hunks: [], raw: "diff a" },
				{ path: "b.ts", old_path: null, status: "added", additions: 3, deletions: 0, is_binary: false, hunks: [], raw: "diff b" },
			],
			total_additions: 4,
			total_deletions: 0,
		};

		const chunks = chunkDiff(parsed);

		expect(chunks).toHaveLength(2);
		expect(chunks[0]!.file_path).toBe("a.ts");
		expect(chunks[1]!.file_path).toBe("b.ts");
		expect(chunks[1]!.status).toBe("added");
	});

	test("estimates tokens as ceil(chars/4)", () => {
		const content = "a".repeat(100);
		const parsed = makeParsedDiff(content);
		const chunks = chunkDiff(parsed);

		expect(chunks[0]!.estimated_tokens).toBe(25);
	});

	test("truncates content exceeding max tokens", () => {
		const largeContent = "x".repeat(40000);
		const parsed = makeParsedDiff(largeContent);
		const chunks = chunkDiff(parsed, 1000);

		expect(chunks[0]!.diff_content).toContain("[truncated:");
		expect(chunks[0]!.diff_content.length).toBeLessThan(largeContent.length);
	});

	test("preserves file metadata in chunks", () => {
		const parsed: ParsedDiff = {
			files: [
				{ path: "img.png", old_path: null, status: "added", additions: 0, deletions: 0, is_binary: true, hunks: [], raw: "binary" },
			],
			total_additions: 0,
			total_deletions: 0,
		};

		const chunks = chunkDiff(parsed);

		expect(chunks[0]!.is_binary).toBe(true);
		expect(chunks[0]!.status).toBe("added");
	});
});
