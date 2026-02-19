import type { LlmClient } from "../llm/client.ts";
import type { StackGroup } from "./types.ts";

const MAX_TITLE_LENGTH = 72;
const TYPE_PREFIX: Record<string, string> = {
	feature: "feat",
	feat: "feat",
	bugfix: "fix",
	fix: "fix",
	refactor: "refactor",
	chore: "chore",
	docs: "docs",
	test: "test",
	config: "chore",
	perf: "perf",
	style: "style",
	ci: "ci",
};

function normalizeTypePrefix(type: string): string {
	return TYPE_PREFIX[type] ?? "chore";
}

function sanitizeTitle(raw: string): string {
	let title = raw.trim().replace(/\.+$/, "");
	if (title.length > MAX_TITLE_LENGTH) {
		title = title.slice(0, MAX_TITLE_LENGTH).replace(/\s\S*$/, "").trimEnd();
	}
	return title;
}

function fallbackTitle(g: StackGroup): string {
	const desc = g.description || g.name;
	const cleaned = desc.replace(/[^\p{L}\p{N}\s\-/.,()]/gu, " ").replace(/\s+/g, " ").trim();
	const prefix = `${normalizeTypePrefix(g.type)}: `;
	const maxDesc = MAX_TITLE_LENGTH - prefix.length;
	const truncated = cleaned.length > maxDesc
		? cleaned.slice(0, maxDesc).replace(/\s\S*$/, "").trimEnd()
		: cleaned;
	return truncated ? `${prefix}${truncated}` : `${prefix}${g.name}`;
}

export async function generatePrTitles(
	llmClient: LlmClient,
	groups: StackGroup[],
	prTitle: string,
	language?: string,
): Promise<Map<string, string>> {
	const groupSummaries = groups
		.map((g, i) => [
			`Group ${i + 1}: "${g.name}"`,
			`  Type: ${g.type}`,
			`  Description: ${g.description}`,
			`  Files (${g.files.length}): ${g.files.slice(0, 10).join(", ")}${g.files.length > 10 ? ` ... +${g.files.length - 10} more` : ""}`,
		].join("\n"))
		.join("\n\n");

	const hasKoreanContext = /[가-힣]/.test(prTitle) || groups.some((g) => /[가-힣]/.test(`${g.name} ${g.description}`));
	const lang = language && language !== "English" && language !== "auto"
		? language
		: hasKoreanContext
			? "Korean"
			: null;
	const langRule = lang
		? `- Write the description part in ${lang}. Keep the type prefix (feat/fix/etc.) in English.`
		: "- Write the description in English.";

	const system = `You generate PR titles for stacked PRs — concise but descriptive, like titles written by a senior engineer.

Rules:
- Format: "type: description"
- type must be one of: feat | fix | refactor | chore | docs | test | perf | style | ci
- description: 5-12 words, imperative mood, no trailing period
- Target length: 40-72 characters total
- Be specific about WHAT changed, not vague
- Each title must be unique across the set
- Never leave description empty
${langRule}

Good examples:
- "feat: add JWT token refresh middleware for auth flow"
- "fix: prevent null user crash on session expiry"
- "refactor: extract shared validation logic into helpers"
- "chore: migrate eslint config to flat format"
- "feat: implement drag-and-drop reordering for canvas nodes"
- "test: add integration tests for payment webhook handler"
- "refactor: split monolithic API router into domain modules"

Bad examples:
- "feat: auth" (too vague)
- "fix: bug" (meaningless)
- "refactor: code" (says nothing)
- "feat: jwt" (just a keyword, not a title)
- "" (empty)

Return ONLY a JSON array: [{"group_id": "...", "title": "..."}]`;

	const user = `Original PR: "${prTitle}"

${groupSummaries}

Generate a descriptive PR title (40-72 chars) for each group. Return JSON array:
[{"group_id": "...", "title": "..."}]`;

	const response = await llmClient.complete(system, user);

	const titles = new Map<string, string>();

	try {
		const cleaned = response.content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
		let parsed: Array<{ group_id: string; title: string }> = [];
		try {
			parsed = JSON.parse(cleaned) as Array<{ group_id: string; title: string }>;
		} catch {
			const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
			if (!arrayMatch) throw new Error("No JSON array found in response");
			parsed = JSON.parse(arrayMatch[0]) as Array<{ group_id: string; title: string }>;
		}
		for (const item of parsed) {
			if (item.group_id && item.title?.trim()) {
				titles.set(item.group_id, sanitizeTitle(item.title));
			}
		}
	} catch {
		for (const g of groups) {
			titles.set(g.id, fallbackTitle(g));
		}
	}

	for (const g of groups) {
		if (!titles.has(g.id) || !titles.get(g.id)) {
			titles.set(g.id, fallbackTitle(g));
		}
	}

	return titles;
}
