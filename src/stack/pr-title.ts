import type { LlmClient } from "../llm/client.ts";
import type { StackGroup } from "./types.ts";

export async function generatePrTitles(
	llmClient: LlmClient,
	groups: StackGroup[],
	prTitle: string,
): Promise<Map<string, string>> {
	const groupSummaries = groups
		.map((g, i) => [
			`Group ${i + 1}: "${g.name}"`,
			`  Type: ${g.type}`,
			`  Description: ${g.description}`,
			`  Files (${g.files.length}): ${g.files.slice(0, 10).join(", ")}${g.files.length > 10 ? ` ... +${g.files.length - 10} more` : ""}`,
		].join("\n"))
		.join("\n\n");

	const system = `You generate short PR titles for stacked PRs.

Rules:
- Format: "type: description" — NO scope parentheses
- type: feat | fix | refactor | chore | docs | test | perf
- description: 3-6 words, imperative mood, lowercase, no period
- Be terse. Shorter is better. Omit filler words (add, implement, update, etc. when redundant)
- Each title must be unique across the set

Good: "feat: jwt token refresh", "fix: null user response", "refactor: shared validators", "chore: eslint config"
Bad: "feat(auth): add jwt token refresh middleware for authentication module" (too long, has scope)

Return ONLY JSON array: [{"group_id": "...", "title": "..."}]`;

	const user = `Original PR: "${prTitle}"

${groupSummaries}

Generate a unique, descriptive PR title for each group. Return JSON array:
[{"group_id": "...", "title": "..."}]`;

	const response = await llmClient.complete(system, user);

	const titles = new Map<string, string>();

	try {
		const cleaned = response.content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
		const parsed = JSON.parse(cleaned) as Array<{ group_id: string; title: string }>;
		for (const item of parsed) {
			if (item.group_id && item.title) {
				titles.set(item.group_id, item.title);
			}
		}
	} catch {
		for (const g of groups) {
			titles.set(g.id, `${g.type}: ${g.description}`);
		}
	}

	for (const g of groups) {
		if (!titles.has(g.id)) {
			titles.set(g.id, `${g.type}: ${g.description}`);
		}
	}

	return titles;
}
