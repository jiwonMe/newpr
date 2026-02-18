import { describe, test, expect } from "bun:test";
import { detectAmbiguousPaths, partitionGroups, buildStackPartitionPrompt } from "./partition.ts";
import type { FileGroup } from "../types/output.ts";
import type { LlmClient, LlmResponse } from "../llm/client.ts";

const mockGroups: FileGroup[] = [
	{ name: "Auth", type: "feature", description: "Authentication changes", files: ["src/auth.ts", "src/shared.ts"] },
	{ name: "UI", type: "feature", description: "UI updates", files: ["src/ui.tsx", "src/shared.ts"] },
	{ name: "Config", type: "config", description: "Config changes", files: ["tsconfig.json"] },
];

describe("detectAmbiguousPaths", () => {
	test("identifies exclusive, ambiguous, and unassigned files", () => {
		const report = detectAmbiguousPaths({
			groups: mockGroups,
			changed_files: ["src/auth.ts", "src/ui.tsx", "src/shared.ts", "src/unknown.ts"],
		});

		expect(report.exclusive.get("src/auth.ts")).toBe("Auth");
		expect(report.exclusive.get("src/ui.tsx")).toBe("UI");

		expect(report.ambiguous).toEqual([
			{ path: "src/shared.ts", groups: ["Auth", "UI"] },
		]);

		expect(report.unassigned).toEqual(["src/unknown.ts"]);
	});

	test("all files exclusive → no ambiguous or unassigned", () => {
		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a.ts"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"] },
		];

		const report = detectAmbiguousPaths({
			groups,
			changed_files: ["a.ts", "b.ts"],
		});

		expect(report.exclusive.size).toBe(2);
		expect(report.ambiguous).toEqual([]);
		expect(report.unassigned).toEqual([]);
	});
});

describe("buildStackPartitionPrompt", () => {
	test("generates prompt with ambiguous and unassigned files", () => {
		const result = buildStackPartitionPrompt(
			[{ path: "src/shared.ts", groups: ["Auth", "UI"] }],
			["src/unknown.ts"],
			mockGroups,
			[{ path: "src/shared.ts", status: "modified", summary: "Shared utilities" }],
			[],
		);

		expect(result.system).toContain("exactly one group");
		expect(result.user).toContain("src/shared.ts");
		expect(result.user).toContain("src/unknown.ts");
		expect(result.user).toContain("Auth");
		expect(result.user).toContain("UI");
	});
});

describe("partitionGroups", () => {
	test("returns immediately when all files are exclusive (no LLM call)", async () => {
		let llmCalled = false;
		const mockClient: LlmClient = {
			complete: async () => {
				llmCalled = true;
				return { content: "{}", model: "test", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
			},
			completeStream: async () => {
				return { content: "{}", model: "test", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
			},
		};

		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a.ts"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"] },
		];

		const result = await partitionGroups(
			mockClient,
			groups,
			["a.ts", "b.ts"],
			[],
			[],
		);

		expect(llmCalled).toBe(false);
		expect(result.ownership.get("a.ts")).toBe("A");
		expect(result.ownership.get("b.ts")).toBe("B");
		expect(result.reattributed).toEqual([]);
	});

	test("calls LLM when ambiguous files exist and parses response", async () => {
		const mockResponse: LlmResponse = {
			content: JSON.stringify({
				assignments: [
					{ path: "src/shared.ts", group: "Auth", reason: "Primarily used for auth" },
					{ path: "src/unknown.ts", group: "Config", reason: "Configuration file" },
				],
				shared_foundation: null,
			}),
			model: "test",
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		};

		const mockClient: LlmClient = {
			complete: async () => mockResponse,
			completeStream: async () => mockResponse,
		};

		const result = await partitionGroups(
			mockClient,
			mockGroups,
			["src/auth.ts", "src/ui.tsx", "src/shared.ts", "src/unknown.ts"],
			[{ path: "src/shared.ts", status: "modified", summary: "Shared utils" }],
			[],
		);

		expect(result.ownership.get("src/auth.ts")).toBe("Auth");
		expect(result.ownership.get("src/ui.tsx")).toBe("UI");
		expect(result.ownership.get("src/shared.ts")).toBe("Auth");
		expect(result.ownership.get("src/unknown.ts")).toBe("Config");

		expect(result.reattributed.length).toBe(2);
		expect(result.reattributed[0]?.path).toBe("src/shared.ts");
		expect(result.reattributed[0]?.to_group).toBe("Auth");
		expect(result.reattributed[0]?.from_groups).toEqual(["Auth", "UI"]);
	});

	test("handles LLM response with code block wrapper", async () => {
		const mockResponse: LlmResponse = {
			content: "```json\n" + JSON.stringify({
				assignments: [
					{ path: "src/shared.ts", group: "Auth", reason: "Auth" },
				],
				shared_foundation: null,
			}) + "\n```",
			model: "test",
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		};

		const mockClient: LlmClient = {
			complete: async () => mockResponse,
			completeStream: async () => mockResponse,
		};

		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth", files: ["src/auth.ts", "src/shared.ts"] },
			{ name: "UI", type: "feature", description: "UI", files: ["src/shared.ts"] },
		];

		const result = await partitionGroups(
			mockClient,
			groups,
			["src/auth.ts", "src/shared.ts"],
			[],
			[],
		);

		expect(result.ownership.get("src/shared.ts")).toBe("Auth");
	});

	test("warns on invalid group name in LLM response", async () => {
		const mockResponse: LlmResponse = {
			content: JSON.stringify({
				assignments: [
					{ path: "src/shared.ts", group: "NonExistentGroup", reason: "Bad" },
				],
				shared_foundation: null,
			}),
			model: "test",
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		};

		const mockClient: LlmClient = {
			complete: async () => mockResponse,
			completeStream: async () => mockResponse,
		};

		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth", files: ["src/auth.ts", "src/shared.ts"] },
			{ name: "UI", type: "feature", description: "UI", files: ["src/shared.ts"] },
		];

		const result = await partitionGroups(
			mockClient,
			groups,
			["src/auth.ts", "src/shared.ts"],
			[],
			[],
		);

		expect(result.warnings.some((w) => w.includes("Unknown group"))).toBe(true);
	});
});
