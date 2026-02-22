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
	customPrompt?: string;
}

function langDirective(lang?: string): string {
	if (!lang || lang === "English") return "";
	return `\nCRITICAL LANGUAGE RULE: ALL text values in your response MUST be written in ${lang}. This includes every summary, description, name, purpose, scope, and impact field. JSON keys stay in English, but ALL string values MUST be in ${lang}. Do NOT use English for any descriptive text.`;
}

function customPromptDirective(customPrompt?: string): string {
	if (!customPrompt?.trim()) return "";
	return `\n\nADDITIONAL USER INSTRUCTIONS:\n${customPrompt.trim()}`;
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
No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}${customPromptDirective(ctx?.customPrompt)}`,
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
Every file must appear in at least one group. No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}${customPromptDirective(ctx?.customPrompt)}`,
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
No markdown, no explanation, just the JSON object.${langDirective(ctx?.language)}${customPromptDirective(ctx?.customPrompt)}`,
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
		? `\n\n--- FILE DIFFS (LINE NUMBERS ARE PRE-COMPUTED — use them directly for [[line:...]] anchors) ---
Each line is prefixed with its new-file line number:
  "L42 + code"  = added line at L42
  "     - code"  = removed line (no new line number)
  "L42   code"  = unchanged context at L42
Use the L-numbers EXACTLY as shown. Do NOT compute line numbers yourself.\n\n${fileDiffs.map((f) => `File: ${f.path}\n${f.diff}`).join("\n\n---\n\n")}`
		: "";

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";
	const lang = ctx?.language && ctx.language !== "English" ? ctx.language : null;

	const discussionCtx = formatDiscussion(ctx);

	return {
		system: `You are an expert code reviewer writing a review walkthrough for other developers.

## Goal
Write a narrative that tells the "story" of this PR — what was changed, why, and how the pieces connect. The reader should finish with a clear mental model of the PR.

## Writing Style
- Write in flowing prose paragraphs. This is a narrative, not a changelog.
- Do NOT use horizontal rules (---), dividers, or excessive headers. Let the prose flow naturally.
- Use ### headers ONLY for major conceptual sections (2-4 max for the whole narrative). Prefer topic sentences over headers.
- Default to prose. Use bullet lists only for 3+ parallel items that are genuinely list-like (e.g., list of API endpoints, config options). Never list things that would read better as a sentence.
- Use tables only when comparing structured data (e.g., before/after schemas, flag mappings).
- Keep paragraphs short (3-5 sentences). Human working memory holds ~4 chunks — each paragraph should be one coherent idea.
- Lead each paragraph with a topic sentence that states the key point. Supporting details follow.
- Use transition phrases to connect paragraphs naturally. If writing in a non-English language, use idiomatic transitions in THAT language — never insert English phrases like "Building on this" into non-English text.
- Use commit history and PR discussion to understand the development progression.

## Anchor Syntax (CRITICAL — this is how readers navigate from your text to the actual code)

There are THREE anchor types. You MUST use ALL of them.

### Group Anchors (MANDATORY)
- Format: [[group:Exact Group Name]]
- Renders as a clickable blue chip.
- You MUST reference EVERY group from the Change Groups list at least once. No exceptions.
- Use the EXACT group name ONLY — do NOT append the type in parentheses. Write [[group:Auth Flow]], NOT [[group:Auth Flow (refactor)]].
- Use group anchors when introducing a topic area or explaining what a set of changes accomplishes together.
- Example: "The [[group:Auth Flow]] group introduces session management."

### File Anchors
- Format: [[file:exact/path/to/file.ts]]
- Renders as a clickable blue chip that opens the file diff.
- Use when referencing a file generally (not a specific line), or when you don't have exact line numbers.
- Use EXACT file paths from the Change Groups context.
- Example: "Configuration is defined in [[file:src/config/auth.ts]]."

### Line Anchors
- Format: [[line:path/to/file.ts#L42-L50]](descriptive text)
- The "descriptive text" becomes a subtle underlined link. Line numbers are NOT visible.
- Use for specific code changes — functions, types, config fields, imports.

### Usage Rules:
- ALWAYS use [[line:path#Lstart-Lend]](text) with BOTH start and end lines. Single lines: [[line:path#L42-L42]](text).
- The (text) must describe WHAT the code does, not WHERE it is. Bad: "lines 42-50". Good: "the new rate limiter middleware".
- Do NOT pair [[file:...]] with [[line:...]] for the same file. The line anchor already opens the file.
- Use the diff context provided to find accurate line numbers. If unsure of exact lines, use [[file:...]] instead.

### ANCHOR DENSITY — THIS IS THE MOST IMPORTANT RULE

Every sentence that describes code MUST contain at least one [[line:...]](...) anchor. A sentence without an anchor is a FAILURE.

Think of this like writing a Wikipedia article: almost every claim links to its source. In your narrative, the "source" is the specific line range in the diff.

**What MUST be anchored:**
- Every function, method, or class mentioned → anchor its declaration
- Every implementation detail (what a function does) → anchor the specific lines
- Every type, interface, or schema → anchor its definition
- Every config change, constant, or environment variable → anchor it
- Every import, export, or wiring between modules → anchor it
- Every conditional logic, error handling, or edge case → anchor the specific branch
- Every before/after comparison → anchor both the old and new code

**Two-level anchoring for functions:**
- Level 1: Anchor the function/class NAME to its full range (e.g., L15-L50)
- Level 2: Inside the same paragraph, anchor EACH logical step to its sub-range (e.g., L18-L22, L24-L30, L32-L40)
- A function description without Level 2 sub-anchors is TOO SPARSE

**Target density: 3-6 line anchors per paragraph.** If a paragraph has fewer than 2 line anchors, you are not anchoring enough.

Example (CORRECT density — 5 anchors in one paragraph):
"[[line:src/auth/session.ts#L15-L50]](The validateToken function) handles the full JWT lifecycle. It [[line:src/auth/session.ts#L18-L22]](extracts the token from the Authorization header), [[line:src/auth/session.ts#L24-L30]](verifies the signature against the configured secret), and [[line:src/auth/session.ts#L32-L40]](checks the expiration timestamp). If validation fails, [[line:src/auth/session.ts#L42-L48]](it throws a typed AuthError with a specific error code)."

Example (TOO SPARSE — only 1 anchor, rest is unlinked prose):
"[[line:src/auth/session.ts#L15-L50]](The validateToken function) handles JWT parsing. It extracts the token, verifies the signature, and checks expiration. If validation fails, it throws an error."
→ This is BAD because "extracts the token", "verifies the signature", "checks expiration", and "throws an error" should ALL be separate line anchors.

### Line Anchor Granularity:
- Anchor individual functions, not entire files: [[line:auth.ts#L15-L30]](validateToken) not [[line:auth.ts#L1-L200]](auth module)
- Anchor key type definitions: [[line:types.ts#L5-L12]](the new UserSession interface)
- Anchor config/schema changes: [[line:schema.ts#L42-L45]](the added rate_limit field)
- Anchor imports and exports that wire things together: [[line:index.ts#L3-L3]](re-exported from the barrel file)
- For multi-part changes, anchor each part separately

GOOD example (all 3 anchor types + high density):
"The [[group:Auth Flow]] group introduces session management. [[line:src/auth/session.ts#L15-L50]](The new validateToken function) handles JWT parsing: [[line:src/auth/session.ts#L18-L22]](it extracts the token from the header), then [[line:src/auth/session.ts#L24-L35]](verifies the signature and checks expiration). [[line:src/auth/middleware.ts#L8-L20]](The auth middleware) invokes it on every request, [[line:src/auth/middleware.ts#L15-L18]](rejecting invalid tokens with a 401). Supporting configuration lives in [[file:src/auth/constants.ts]]."

BAD examples:
- Unanchored prose: "The function extracts the token, verifies the signature, and checks expiration." → MUST anchor EACH action
- No group anchors: "The auth changes introduce session management." → MUST use [[group:Auth Flow]]
- One big anchor: "[[line:session.ts#L15-L50]](The function extracts tokens, verifies signatures, and checks expiration)" → MUST split into sub-anchors
- Bare line anchor: "[[line:src/auth/session.ts#L15-L30]]" → MUST have (text) after it
- Low density paragraph: A paragraph with only 1 line anchor and 4+ sentences of plain text → MUST add more anchors

	${lang ? `CRITICAL: Write the ENTIRE narrative in ${lang}. Every sentence must be in ${lang}. Do NOT use English except for code identifiers, file paths, and anchor tokens.` : "If the PR title is in a non-English language, write the narrative in that same language."}${customPromptDirective(ctx?.customPrompt)}`,
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
	if (exploration.react_doctor) {
		sections.push(`=== React Doctor Analysis (react-doctor) ===\n${exploration.react_doctor}`);
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

You have full codebase analysis below. Use it to explain HOW the changes relate to existing code — mention specific existing functions, patterns, and callers that are affected. This context should enrich your line anchor usage with cross-references to existing code.`,
		user: `${base.user}\n\n--- CODEBASE CONTEXT (from agentic exploration) ---\n${context}`,
	};
}
