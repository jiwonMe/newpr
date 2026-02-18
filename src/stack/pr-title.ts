import type { LlmClient } from "../llm/client.ts";
import type { StackGroup } from "./types.ts";

function truncateTitle(type: string, text: string): string {
	const words = text.split(/\s+/).filter(Boolean);
	const kept = words.slice(0, 5).join(" ");
	const title = `${type}: ${kept}`;
	return title.length > 40 ? title.slice(0, 40).trimEnd() : title;
}

function fallbackTitle(g: StackGroup): string {
	const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	return truncateTitle(g.type, slug);
}

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

	const system = `You generate short PR titles for stacked PRs — like real GitHub PR titles.

Rules:
- Format: "type: description"
- type must be one of: feat | fix | refactor | chore | docs | test | perf
- description: 2-5 words MAX. Imperative mood, lowercase, no period
- HARD LIMIT: entire title must be under 40 characters total
- Cut aggressively. Think of it as a git branch name in prose form
- NO scope parentheses, NO filler words (add, implement, introduce, update, support, handle, ensure)
- Each title must be unique across the set

Good examples:
- "feat: jwt token refresh"
- "fix: null user crash"
- "refactor: shared validators"
- "chore: eslint config"
- "test: auth edge cases"
- "feat: loop node schema"
- "refactor: canvas renderer"

Bad examples (TOO LONG):
- "feat: add jwt token refresh middleware for authentication" (way too long)
- "feat: implement loop node support for workflow editor" (too many words)
- "refactor: update canvas rendering logic to support new shapes" (sentence, not title)

Return ONLY JSON array: [{"group_id": "...", "title": "..."}]`;

	const user = `Original PR: "${prTitle}"

${groupSummaries}

Generate a unique, short PR title for each group (<40 chars). Return JSON array:
[{"group_id": "...", "title": "..."}]`;

	const response = await llmClient.complete(system, user);

	const titles = new Map<string, string>();

	try {
		const cleaned = response.content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
		const parsed = JSON.parse(cleaned) as Array<{ group_id: string; title: string }>;
		for (const item of parsed) {
			if (item.group_id && item.title) {
				const t = item.title.length > 40 ? truncateTitle(item.title.split(":")[0] ?? "chore", item.title.split(":").slice(1).join(":").trim()) : item.title;
				titles.set(item.group_id, t);
			}
		}
	} catch {
		for (const g of groups) {
			titles.set(g.id, fallbackTitle(g));
		}
	}

	for (const g of groups) {
		if (!titles.has(g.id)) {
			titles.set(g.id, fallbackTitle(g));
		}
	}

	return titles;
}
