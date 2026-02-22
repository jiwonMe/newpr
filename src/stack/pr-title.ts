import type { LlmClient } from "../llm/client.ts";
import type { StackGroup } from "./types.ts";
import { safeParseJson } from "./json-utils.ts";

const MAX_TITLE_LENGTH = 72;
const KOREAN_NOUN_END_RE = /(추가|개선|수정|정리|분리|통합|구현|적용|도입|구성|지원|처리|보강|최적화|리팩터링|안정화|마이그레이션|업데이트|생성|검증|연동|변경|제거|작성|설정|관리|보호|강화|정의|확장|대응|복구|표시|유지|등록|삭제|작업)$/;
const KOREAN_VERB_END_RE = /(합니다|하였다|했다|한다|되었다|됐다|되다|하다)$/;
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

function isKoreanLanguage(languageHint: string | null): boolean {
	if (!languageHint) return false;
	return /korean|^ko$/i.test(languageHint);
}

function ensureNounFormDescription(description: string, languageHint: string | null): string {
	let desc = description.trim().replace(/\.+$/, "");
	if (!desc) return isKoreanLanguage(languageHint) ? "변경 작업" : "update";

	const hasKoreanContext = /[가-힣]/.test(desc) || isKoreanLanguage(languageHint);
	if (!hasKoreanContext) return desc;
	if (KOREAN_NOUN_END_RE.test(desc)) return desc;

	const verbTrimmed = desc.replace(KOREAN_VERB_END_RE, "").trim();
	if (verbTrimmed) {
		if (KOREAN_NOUN_END_RE.test(verbTrimmed)) return verbTrimmed;
		return `${verbTrimmed} 작업`;
	}

	return "변경 작업";
}

function splitTitle(raw: string): { prefix: string; description: string } {
	const idx = raw.indexOf(":");
	if (idx < 0) return { prefix: "", description: raw.trim() };
	return {
		prefix: raw.slice(0, idx).trim(),
		description: raw.slice(idx + 1).trim(),
	};
}

function sanitizeTitle(raw: string, languageHint: string | null): string {
	const parsed = splitTitle(raw);
	const prefix = parsed.prefix;
	let description = ensureNounFormDescription(parsed.description, languageHint);
	let title = prefix ? `${prefix}: ${description}` : description;
	title = title.trim().replace(/\.+$/, "");

	if (title.length > MAX_TITLE_LENGTH) {
		if (prefix) {
			const prefixText = `${prefix}: `;
			const maxDesc = MAX_TITLE_LENGTH - prefixText.length;
			description = description.slice(0, maxDesc).replace(/\s\S*$/, "").trimEnd();
			description = ensureNounFormDescription(description, languageHint);
			if (description.length > maxDesc) {
				description = description.slice(0, maxDesc).trimEnd();
			}
			title = `${prefixText}${description || ensureNounFormDescription("", languageHint)}`;
		} else {
			title = title.slice(0, MAX_TITLE_LENGTH).replace(/\s\S*$/, "").trimEnd();
		}
	}

	return title;
}

function fallbackTitle(g: StackGroup, languageHint: string | null): string {
	const desc = g.description || g.name;
	const cleaned = desc.replace(/[^\p{L}\p{N}\s\-/.,()]/gu, " ").replace(/\s+/g, " ").trim();
	const prefix = `${normalizeTypePrefix(g.type)}: `;
	const maxDesc = MAX_TITLE_LENGTH - prefix.length;
	const truncated = cleaned.length > maxDesc
		? cleaned.slice(0, maxDesc).replace(/\s\S*$/, "").trimEnd()
		: cleaned;
	return sanitizeTitle(truncated ? `${prefix}${truncated}` : `${prefix}${g.name}`, languageHint);
}

export async function generatePrTitles(
	llmClient: LlmClient,
	groups: StackGroup[],
	prTitle: string,
	language?: string,
): Promise<Map<string, string>> {
	const groupSummaries = groups
		.map((g, i) => [
			`Group ${i + 1}:`,
			`  group_id: "${g.id}"`,
			`  name: "${g.name}"`,
			`  type: ${g.type}`,
			`  description: ${g.description}`,
			`  files (${g.files.length}): ${g.files.slice(0, 10).join(", ")}${g.files.length > 10 ? ` ... +${g.files.length - 10} more` : ""}`,
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
- description: 4-12 words, noun phrase only, must end with a noun, no trailing period
- Target length: 40-72 characters total
- Be specific about WHAT changed, not vague
- Each title must be unique across the set
- Never leave description empty
${langRule}

Good examples:
- "feat: JWT token refresh middleware integration"
- "fix: session expiry null user crash prevention"
- "refactor: shared validation helper extraction"
- "chore: eslint flat config migration"
- "feat: canvas node drag-and-drop reorder support"
- "test: payment webhook integration test coverage"
- "refactor: monolithic API router module split"

Bad examples:
- "feat: auth" (too vague)
- "fix: bug" (meaningless)
- "refactor: code" (says nothing)
- "feat: jwt" (just a keyword, not a title)
- "feat: add JWT refresh middleware" (imperative verb)
- "" (empty)

IMPORTANT: The "group_id" in your response MUST exactly match the group_id value provided for each group. Do not use the group name or any other value.

Return ONLY a JSON array: [{"group_id": "exact group_id from input", "title": "type: descriptive noun phrase"}]`;

	const user = `Original PR: "${prTitle}"

${groupSummaries}

Generate a unique, descriptive PR title (40-72 chars) for EACH group above. The group_id in your output must exactly match the group_id shown for each group.
Return JSON array: [{"group_id": "...", "title": "..."}]`;

	const response = await llmClient.complete(system, user);

	const titles = new Map<string, string>();

	const nameToId = new Map<string, string>();
	for (const g of groups) {
		nameToId.set(g.name.toLowerCase(), g.id);
		nameToId.set(g.id.toLowerCase(), g.id);
	}

	try {
		const result = safeParseJson<Array<{ group_id: string; title: string }>>(response.content);
		if (!result.ok) throw new Error(result.error);
		const parsed = result.data;
		if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
		for (const item of parsed) {
			if (!item.group_id || !item.title?.trim()) continue;
			const resolvedId = nameToId.get(item.group_id.toLowerCase()) ?? item.group_id;
			titles.set(resolvedId, sanitizeTitle(item.title, lang));
		}
	} catch {
		for (const g of groups) {
			titles.set(g.id, fallbackTitle(g, lang));
		}
	}

	for (const g of groups) {
		if (!titles.has(g.id) || !titles.get(g.id)) {
			titles.set(g.id, fallbackTitle(g, lang));
		}
	}

	return titles;
}
