import type { DiffChunk } from "../types/diff.ts";
import type { FileGroup, FileStatus, PrSummary } from "../types/output.ts";
import type { PrCommit } from "../types/github.ts";
import type { ExplorationResult } from "../workspace/types.ts";

export interface PromptPair {
	system: string;
	user: string;
}

export interface FileSummaryInput {
	path: string;
	summary: string;
	status: FileStatus;
}

export interface PromptContext {
	commits?: PrCommit[];
	language?: string;
	prBody?: string;
	discussion?: Array<{ author: string; body: string }>;
}

function langDirective(lang?: string): string {
	if (!lang || lang === "English") return "";
	return `\nCRITICAL LANGUAGE RULE: ALL text values in your response MUST be written in ${lang}. This includes every summary, description, name, purpose, scope, and impact field. JSON keys stay in English, but ALL string values MUST be in ${lang}. Do NOT use English for any descriptive text.`;
}

function formatDiscussion(ctx?: PromptContext): string {
	const parts: string[] = [];
	if (ctx?.prBody?.trim()) {
		parts.push(`PR Description:\n${ctx.prBody.trim()}`);
	}
	if (ctx?.discussion && ctx.discussion.length > 0) {
		const comments = ctx.discussion
			.map((c) => `@${c.author}: ${c.body.length > 500 ? `${c.body.slice(0, 500)}…` : c.body}`)
			.join("\n\n");
		parts.push(`Discussion (${ctx.discussion.length} comments):\n${comments}`);
	}
	if (parts.length === 0) return "";
	return `\n\n--- PR DISCUSSION ---\n${parts.join("\n\n")}`;
}

function formatCommitHistory(commits: PrCommit[]): string {
	if (commits.length === 0) return "";
	const lines = commits.map((c) => {
		const firstLine = c.message.split("\n")[0]!;
		const filesStr = c.files.length > 0 ? ` [${c.files.slice(0, 5).join(", ")}${c.files.length > 5 ? `, +${c.files.length - 5} more` : ""}]` : "";
		return `- ${c.sha} ${firstLine}${filesStr}`;
	});
	return `\n\nCommit History (${commits.length} commits, chronological):\n${lines.join("\n")}`;
}

export function buildFileSummaryPrompt(chunks: DiffChunk[], ctx?: PromptContext): PromptPair {
	const fileList = chunks
		.map((c) => {
			if (c.is_binary) return `File: ${c.file_path} (binary file, ${c.status})`;
			return `File: ${c.file_path} (${c.status}, +${c.additions}/-${c.deletions})\n\`\`\`diff\n${c.diff_content}\n\`\`\``;
		})
		.join("\n\n---\n\n");

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";

	const discussionCtx = formatDiscussion(ctx);

	return {
		system: `You are an expert code reviewer. Analyze the given diff and provide a 1-line summary for each changed file.
Use the commit history and PR discussion to understand the intent behind each change — why the change was made, not just what changed.
Respond ONLY with a JSON array. Each element: {"path": "file/path", "summary": "one line description of what changed"}.
The "path" value must be the exact file path. The "summary" value is a human-readable description.
No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}`,
		user: `${fileList}${commitCtx}${discussionCtx}`,
	};
}

export function buildGroupingPrompt(fileSummaries: FileSummaryInput[], ctx?: PromptContext): PromptPair {
	const fileList = fileSummaries
		.map((f) => `- ${f.path} (${f.status}): ${f.summary}`)
		.join("\n");

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";

	const discussionCtx = formatDiscussion(ctx);

	return {
		system: `You are an expert code reviewer. Group the following changed files by their semantic purpose and provide detailed analysis for each group.
Each group should have:
- "name": descriptive group name
- "type": one of: feature, refactor, bugfix, chore, docs, test, config
- "description": what this group of changes does (1-2 sentences)
- "files": list of file paths
- "key_changes": 2-5 bullet points describing the most important specific changes (e.g. "Add JWT token validation middleware", "Replace REST calls with GraphQL queries")
- "risk": a brief risk assessment for this group (e.g. "Low - cosmetic changes only", "Medium - modifies auth flow, needs careful review", "High - changes database schema")
- "dependencies": list of other group names that this group depends on or interacts with (empty array if none)

A file MAY appear in multiple groups if it serves multiple purposes.
Use the commit history and PR discussion to understand which changes belong together logically.
Respond ONLY with a JSON array. Each element: {"name": "...", "type": "...", "description": "...", "files": [...], "key_changes": [...], "risk": "...", "dependencies": [...]}.
The "type" value must be one of the English keywords listed above. File paths stay as-is.
Every file must appear in at least one group. No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}`,
		user: `Changed files:\n${fileList}${commitCtx}${discussionCtx}`,
	};
}

export function buildOverallSummaryPrompt(
	prTitle: string,
	groups: FileGroup[],
	fileSummaries: Array<{ path: string; summary: string }>,
	ctx?: PromptContext,
): PromptPair {
	const groupList = groups
		.map((g) => `- [${g.type}] ${g.name}: ${g.description} (${g.files.length} files)`)
		.join("\n");

	const fileList = fileSummaries.map((f) => `- ${f.path}: ${f.summary}`).join("\n");
	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";

	const discussionCtx = formatDiscussion(ctx);

	return {
		system: `You are an expert code reviewer. Provide an overall summary of this Pull Request.
Use the commit history and PR discussion to understand the development progression and intent. The PR description and reviewer comments provide essential context about why changes were made.
Respond ONLY with a JSON object: {"purpose": "why this PR exists (1-2 sentences)", "scope": "what areas of code are affected", "impact": "what is the impact of these changes", "risk_level": "low|medium|high"}.
The "purpose", "scope", and "impact" values are human-readable text. The "risk_level" must be one of: low, medium, high (in English).
No markdown, no explanation, just the JSON object.${langDirective(ctx?.language)}`,
		user: `PR Title: ${prTitle}\n\nChange Groups:\n${groupList}\n\nFile Summaries:\n${fileList}${commitCtx}${discussionCtx}`,
	};
}

export function buildNarrativePrompt(
	prTitle: string,
	summary: PrSummary,
	groups: FileGroup[],
	ctx?: PromptContext,
	fileDiffs?: Array<{ path: string; diff: string }>,
): PromptPair {
	const groupDetails = groups
		.map((g) => {
			let detail = `### ${g.name} (${g.type})\n${g.description}\nFiles: ${g.files.join(", ")}`;
			if (g.key_changes && g.key_changes.length > 0) {
				detail += `\nKey changes:\n${g.key_changes.map((c) => `- ${c}`).join("\n")}`;
			}
			return detail;
		})
		.join("\n\n");

	const diffContext = fileDiffs && fileDiffs.length > 0
		? `\n\n--- FILE DIFFS (use these line numbers for [[line:...]] anchors) ---\n${fileDiffs.map((f) => `File: ${f.path}\n${f.diff}`).join("\n\n---\n\n")}`
		: "";

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";
	const lang = ctx?.language && ctx.language !== "English" ? ctx.language : null;

	const discussionCtx = formatDiscussion(ctx);

	return {
		system: `You are an expert code reviewer writing a review walkthrough for other developers.
Write a clear, concise narrative that tells the "story" of this PR — what changes were made and in what logical order.
Use the commit history and PR discussion to understand the development progression: which changes came first, how the PR evolved, and the intent behind each step. The PR description often explains the author's motivation and approach.
Use markdown formatting. Write 2-5 paragraphs. Do NOT use JSON. Write natural prose.
${lang ? `CRITICAL: Write the ENTIRE narrative in ${lang}. Every sentence must be in ${lang}. Do NOT use English except for code identifiers, file paths, and [[group:...]]/[[file:...]] tokens.` : "If the PR title is in a non-English language, write the narrative in that same language."}

IMPORTANT: Use these anchor formats — they become clickable links in the UI:

1. Group: [[group:Group Name]] — renders as a clickable chip.
2. File: [[file:path/to/file.ts]] — renders as a clickable chip.
3. Line reference: [[line:path/to/file.ts#L42-L50]](descriptive text here) — the "descriptive text" becomes an underlined clickable link that opens the diff at that line. The line info itself is NOT shown to the user — only the descriptive text is visible.

RULES:
- Use EXACT group names and file paths from the context above.
- Every group MUST be referenced at least once with [[group:...]].
- For line references, ALWAYS use the form [[line:path#Lstart-Lend]](text). NEVER use bare [[line:...]] without (text).
- The (text) should be a natural description of what the code does, NOT the file name or line numbers. The reader should not see any line numbers — they just see underlined text they can click.
- Do NOT place [[file:...]] and [[line:...]] next to each other for the same file. Use [[line:...]] with descriptive text instead — it already opens the file.
- Aim for most sentences about code to have at least one [[line:...]](...) reference.

GOOD example:
"The [[group:Auth Flow]] group introduces session management. [[line:src/auth/session.ts#L15-L30]](The new validateToken function) handles JWT parsing, and [[line:src/auth/middleware.ts#L8-L12]](the auth middleware) invokes it on every request."

BAD example (DO NOT do this):
"The new validateToken function [[line:src/auth/session.ts#L15-L30]] in [[file:src/auth/session.ts]] handles JWT parsing."`,
		user: `PR Title: ${prTitle}\n\nSummary:\n- Purpose: ${summary.purpose}\n- Scope: ${summary.scope}\n- Impact: ${summary.impact}\n- Risk: ${summary.risk_level}\n\nChange Groups:\n${groupDetails}${commitCtx}${discussionCtx}${diffContext}`,
	};
}

function formatCodebaseContext(exploration: ExplorationResult): string {
	const sections: string[] = [];
	if (exploration.project_structure) {
		sections.push(`=== Project Structure ===\n${exploration.project_structure}`);
	}
	if (exploration.related_code) {
		sections.push(`=== Related Code & Dependencies ===\n${exploration.related_code}`);
	}
	if (exploration.potential_issues) {
		sections.push(`=== Potential Issues (from codebase analysis) ===\n${exploration.potential_issues}`);
	}
	return sections.join("\n\n");
}

export function buildEnrichedSummaryPrompt(
	prTitle: string,
	groups: FileGroup[],
	fileSummaries: Array<{ path: string; summary: string }>,
	exploration: ExplorationResult,
	ctx?: PromptContext,
): PromptPair {
	const base = buildOverallSummaryPrompt(prTitle, groups, fileSummaries, ctx);
	const context = formatCodebaseContext(exploration);

	return {
		system: base.system.replace(
			"Provide an overall summary",
			"Using the full codebase context below, provide a deeply informed summary",
		),
		user: `${base.user}\n\n--- CODEBASE CONTEXT (from agentic exploration) ---\n${context}`,
	};
}

export function buildEnrichedNarrativePrompt(
	prTitle: string,
	summary: PrSummary,
	groups: FileGroup[],
	exploration: ExplorationResult,
	ctx?: PromptContext,
	fileDiffs?: Array<{ path: string; diff: string }>,
): PromptPair {
	const base = buildNarrativePrompt(prTitle, summary, groups, ctx, fileDiffs);
	const context = formatCodebaseContext(exploration);

	return {
		system: `${base.system}
You have access to full codebase analysis. Use it to explain HOW the changes relate to existing code, not just WHAT changed.
Mention specific existing functions, modules, or patterns that are affected.
Use [[group:Name]], [[file:path]], and [[line:path#L42-L50]](descriptive text) as instructed above.`,
		user: `${base.user}\n\n--- CODEBASE CONTEXT (from agentic exploration) ---\n${context}`,
	};
}
