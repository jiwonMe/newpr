import { test, expect, describe } from "bun:test";
import {
	buildFileSummaryPrompt,
	buildGroupingPrompt,
	buildOverallSummaryPrompt,
	buildNarrativePrompt,
} from "../../src/llm/prompts.ts";
import type { DiffChunk } from "../../src/types/diff.ts";

describe("buildFileSummaryPrompt", () => {
	test("includes file paths and diff content", () => {
		const chunks: DiffChunk[] = [
			{ file_path: "src/a.ts", status: "modified", additions: 5, deletions: 2, is_binary: false, diff_content: "+new line", estimated_tokens: 10 },
		];

		const prompt = buildFileSummaryPrompt(chunks);

		expect(prompt.system).toContain("JSON array");
		expect(prompt.user).toContain("src/a.ts");
		expect(prompt.user).toContain("+new line");
	});

	test("handles binary files", () => {
		const chunks: DiffChunk[] = [
			{ file_path: "img.png", status: "added", additions: 0, deletions: 0, is_binary: true, diff_content: "", estimated_tokens: 0 },
		];

		const prompt = buildFileSummaryPrompt(chunks);
		expect(prompt.user).toContain("binary file");
	});
});

describe("buildGroupingPrompt", () => {
	test("includes file summaries and statuses", () => {
		const prompt = buildGroupingPrompt([
			{ path: "src/auth.ts", summary: "Added login function", status: "modified" },
			{ path: "tests/auth.test.ts", summary: "Added auth tests", status: "added" },
		]);

		expect(prompt.system).toContain("JSON array");
		expect(prompt.system).toContain("feature");
		expect(prompt.user).toContain("src/auth.ts");
		expect(prompt.user).toContain("Added login function");
	});
});

describe("buildOverallSummaryPrompt", () => {
	test("includes PR title, groups, and file summaries", () => {
		const prompt = buildOverallSummaryPrompt(
			"Add auth feature",
			[{ name: "Auth", type: "feature", description: "New auth flow", files: ["a.ts"] }],
			[{ path: "a.ts", summary: "Added auth" }],
		);

		expect(prompt.system).toContain("risk_level");
		expect(prompt.user).toContain("Add auth feature");
		expect(prompt.user).toContain("Auth");
	});
});

describe("buildNarrativePrompt", () => {
	test("requests markdown narrative with PR context", () => {
		const prompt = buildNarrativePrompt(
			"Refactor DB layer",
			{ purpose: "Clean up DB", scope: "Database", impact: "Better perf", risk_level: "medium" },
			[{ name: "DB refactor", type: "refactor", description: "Restructured queries", files: ["db.ts"] }],
		);

		expect(prompt.system).toContain("markdown");
		expect(prompt.system).toContain("narrative");
		expect(prompt.user).toContain("Refactor DB layer");
		expect(prompt.user).toContain("Clean up DB");
	});
});
