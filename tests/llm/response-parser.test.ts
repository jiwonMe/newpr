import { test, expect, describe } from "bun:test";
import {
	parseFileSummaries,
	parseGroups,
	parseSummary,
	parseNarrative,
} from "../../src/llm/response-parser.ts";

describe("parseFileSummaries", () => {
	test("parses valid JSON array", () => {
		const raw = '[{"path": "a.ts", "summary": "Added feature"}]';
		const result = parseFileSummaries(raw);
		expect(result).toEqual([{ path: "a.ts", summary: "Added feature" }]);
	});

	test("parses JSON wrapped in code blocks", () => {
		const raw = '```json\n[{"path": "b.ts", "summary": "Fixed bug"}]\n```';
		const result = parseFileSummaries(raw);
		expect(result).toEqual([{ path: "b.ts", summary: "Fixed bug" }]);
	});

	test("provides defaults for missing fields", () => {
		const raw = '[{"path": "c.ts"}]';
		const result = parseFileSummaries(raw);
		expect(result[0]!.summary).toBe("No summary available");
	});

	test("throws on non-array", () => {
		expect(() => parseFileSummaries('{"not": "array"}')).toThrow("Expected JSON array");
	});
});

describe("parseGroups", () => {
	test("parses valid groups", () => {
		const raw = '[{"name": "Auth", "type": "feature", "description": "New auth", "files": ["a.ts"]}]';
		const result = parseGroups(raw);
		expect(result[0]!.name).toBe("Auth");
		expect(result[0]!.type).toBe("feature");
		expect(result[0]!.files).toEqual(["a.ts"]);
	});

	test("defaults invalid type to chore", () => {
		const raw = '[{"name": "X", "type": "invalid_type", "description": "", "files": []}]';
		const result = parseGroups(raw);
		expect(result[0]!.type).toBe("chore");
	});

	test("handles missing files array", () => {
		const raw = '[{"name": "X", "type": "feature", "description": ""}]';
		const result = parseGroups(raw);
		expect(result[0]!.files).toEqual([]);
	});
});

describe("parseSummary", () => {
	test("parses valid summary", () => {
		const raw = '{"purpose": "Add auth", "scope": "Auth module", "impact": "High", "risk_level": "high"}';
		const result = parseSummary(raw);
		expect(result.purpose).toBe("Add auth");
		expect(result.risk_level).toBe("high");
	});

	test("defaults invalid risk_level to medium", () => {
		const raw = '{"purpose": "X", "scope": "Y", "impact": "Z", "risk_level": "extreme"}';
		const result = parseSummary(raw);
		expect(result.risk_level).toBe("medium");
	});

	test("provides defaults for missing fields", () => {
		const raw = "{}";
		const result = parseSummary(raw);
		expect(result.purpose).toBe("No purpose provided");
		expect(result.scope).toBe("Unknown scope");
	});

	test("handles code block wrapping", () => {
		const raw = '```json\n{"purpose": "test", "scope": "s", "impact": "i", "risk_level": "low"}\n```';
		const result = parseSummary(raw);
		expect(result.purpose).toBe("test");
		expect(result.risk_level).toBe("low");
	});
});

describe("parseNarrative", () => {
	test("returns trimmed raw text", () => {
		const raw = "  This is the narrative.\n\nWith paragraphs.  ";
		const result = parseNarrative(raw);
		expect(result).toBe("This is the narrative.\n\nWith paragraphs.");
	});
});
