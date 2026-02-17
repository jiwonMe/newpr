import type { FileGroup, GroupType, PrSummary, RiskLevel } from "../types/output.ts";

function extractJson(raw: string): string {
	const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (codeBlockMatch) return codeBlockMatch[1]!.trim();
	return raw.trim();
}

const VALID_GROUP_TYPES = new Set<GroupType>([
	"feature", "refactor", "bugfix", "chore", "docs", "test", "config",
]);

const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);

export function parseFileSummaries(raw: string): Array<{ path: string; summary: string }> {
	const jsonStr = extractJson(raw);
	const parsed: unknown = JSON.parse(jsonStr);

	if (!Array.isArray(parsed)) {
		throw new Error("Expected JSON array for file summaries");
	}

	return parsed.map((item: Record<string, unknown>) => ({
		path: String(item.path ?? ""),
		summary: String(item.summary ?? "No summary available"),
	}));
}

export function parseGroups(raw: string): FileGroup[] {
	const jsonStr = extractJson(raw);
	const parsed: unknown = JSON.parse(jsonStr);

	if (!Array.isArray(parsed)) {
		throw new Error("Expected JSON array for groups");
	}

	return parsed.map((item: Record<string, unknown>) => {
		const rawType = String(item.type ?? "chore");
		const type: GroupType = VALID_GROUP_TYPES.has(rawType as GroupType)
			? (rawType as GroupType)
			: "chore";

		return {
			name: String(item.name ?? "Ungrouped"),
			type,
			description: String(item.description ?? ""),
			files: Array.isArray(item.files) ? item.files.map(String) : [],
		};
	});
}

export function parseSummary(raw: string): PrSummary {
	const jsonStr = extractJson(raw);
	const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

	const rawRisk = String(parsed.risk_level ?? "medium");
	const risk_level: RiskLevel = VALID_RISK_LEVELS.has(rawRisk as RiskLevel)
		? (rawRisk as RiskLevel)
		: "medium";

	return {
		purpose: String(parsed.purpose ?? "No purpose provided"),
		scope: String(parsed.scope ?? "Unknown scope"),
		impact: String(parsed.impact ?? "Unknown impact"),
		risk_level,
	};
}

export function parseNarrative(raw: string): string {
	return raw.trim();
}
