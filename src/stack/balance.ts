import type { LlmClient } from "../llm/client.ts";
import type { FileGroup } from "../types/output.ts";
import type { StackWarning } from "./types.ts";
import { safeParseJson } from "./json-utils.ts";

export interface BalanceResult {
	ownership: Map<string, string>;
	warnings: StackWarning[];
	moves: Array<{ path: string; from: string; to: string }>;
}

interface GroupSize {
	id: string;
	fileCount: number;
}

function detectImbalance(groups: GroupSize[]): { oversized: GroupSize[]; threshold: number } | null {
	if (groups.length < 2) return null;

	const counts = groups.map((g) => g.fileCount).sort((a, b) => a - b);
	const median = counts[Math.floor(counts.length / 2)]!;
	const threshold = Math.max(median * 3, 15);

	const oversized = groups.filter((g) => g.fileCount > threshold);
	if (oversized.length === 0) return null;

	return { oversized, threshold };
}

export async function rebalanceGroups(
	llmClient: LlmClient,
	ownership: Map<string, string>,
	groups: FileGroup[],
): Promise<BalanceResult> {
	const groupSizes = new Map<string, string[]>();
	for (const [path, groupId] of ownership) {
		const files = groupSizes.get(groupId) ?? [];
		files.push(path);
		groupSizes.set(groupId, files);
	}

	const sizeList: GroupSize[] = [...groupSizes.entries()].map(([id, files]) => ({
		id,
		fileCount: files.length,
	}));

	const imbalance = detectImbalance(sizeList);
	if (!imbalance) {
		return { ownership, warnings: [], moves: [] };
	}

	const groupDescriptions = groups
		.map((g) => {
			const files = groupSizes.get(g.name) ?? [];
			return `- "${g.name}" (${g.type}, ${files.length} files): ${g.description}`;
		})
		.join("\n");

	const oversizedDetails = imbalance.oversized
		.map((g) => {
			const files = groupSizes.get(g.id) ?? [];
			return `"${g.id}" (${files.length} files):\n${files.map((f) => `  - ${f}`).join("\n")}`;
		})
		.join("\n\n");

	const system = `You are a code organization expert. Your task is to rebalance PR groups so they are more evenly sized.

Rules:
1. Move files from oversized groups to other groups where they logically fit
2. Only move files that genuinely belong better in another group based on file path and purpose
3. If a file doesn't fit anywhere else, leave it in the current group
4. Do NOT create new groups
5. Aim for each group having roughly similar file counts
6. Prioritize logical cohesion over perfect balance — don't force moves that don't make sense
7. Move at most 50% of files from any oversized group

Response format (JSON only, no markdown):
{
  "moves": [
    { "path": "src/foo.ts", "to": "Target Group Name", "reason": "brief reason" }
  ]
}

If no moves make sense, return: { "moves": [] }`;

	const user = `Groups:\n${groupDescriptions}\n\nOversized groups (>${imbalance.threshold} files):\n${oversizedDetails}\n\nSuggest file moves to rebalance.`;

	const newOwnership = new Map(ownership);
	const moves: Array<{ path: string; from: string; to: string }> = [];
	const warnings: StackWarning[] = [];

	try {
		const response = await llmClient.complete(system, user);
		const result = safeParseJson<{ moves: Array<{ path: string; to: string; reason: string }> }>(response.content);
		if (!result.ok) throw new Error(result.error);
		const parsed = result.data;

		const validGroupNames = new Set(groups.map((g) => g.name));

		for (const move of parsed.moves ?? []) {
			if (!move.path || !move.to) continue;
			if (!validGroupNames.has(move.to)) continue;

			const currentGroup = newOwnership.get(move.path);
			if (!currentGroup || currentGroup === move.to) continue;

			newOwnership.set(move.path, move.to);
			moves.push({ path: move.path, from: currentGroup, to: move.to });
		}

		if (moves.length > 0) {
			warnings.push({
				category: "grouping",
				severity: "info",
				title: `${moves.length} file(s) rebalanced across groups`,
				message: "Files were moved from oversized groups to better-fitting groups for more balanced PRs",
				details: moves.map((m) => `${m.path}: "${m.from}" → "${m.to}"`),
			});
		}
	} catch {
		warnings.push({
			category: "system",
			severity: "warn",
			title: "Group rebalancing skipped",
			message: "AI rebalancing failed — proceeding with original distribution",
		});
	}

	return { ownership: newOwnership, warnings, moves };
}
