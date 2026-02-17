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
}

function langDirective(lang?: string): string {
	if (!lang || lang === "English") return "";
	return `\nCRITICAL LANGUAGE RULE: ALL text values in your response MUST be written in ${lang}. This includes every summary, description, name, purpose, scope, and impact field. JSON keys stay in English, but ALL string values MUST be in ${lang}. Do NOT use English for any descriptive text.`;
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

	return {
		system: `You are an expert code reviewer. Analyze the given diff and provide a 1-line summary for each changed file.
Use the commit history to understand the intent behind each change — why the change was made, not just what changed.
Respond ONLY with a JSON array. Each element: {"path": "file/path", "summary": "one line description of what changed"}.
The "path" value must be the exact file path. The "summary" value is a human-readable description.
No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}`,
		user: `${fileList}${commitCtx}`,
	};
}

export function buildGroupingPrompt(fileSummaries: FileSummaryInput[], ctx?: PromptContext): PromptPair {
	const fileList = fileSummaries
		.map((f) => `- ${f.path} (${f.status}): ${f.summary}`)
		.join("\n");

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";

	return {
		system: `You are an expert code reviewer. Group the following changed files by their semantic purpose.
Each group should have a descriptive name, a type (one of: feature, refactor, bugfix, chore, docs, test, config), a description, and a list of file paths.
A file MAY appear in multiple groups if it serves multiple purposes (e.g., index.ts re-exporting for both a feature and a refactor).
Use the commit history to understand which changes belong together logically.
Respond ONLY with a JSON array. Each element: {"name": "group name", "type": "feature|refactor|bugfix|chore|docs|test|config", "description": "what this group of changes does", "files": ["path1", "path2"]}.
The "name" and "description" values are human-readable text. The "type" value must be one of the English keywords listed above. File paths stay as-is.
Every file must appear in at least one group. No markdown, no explanation, just the JSON array.${langDirective(ctx?.language)}`,
		user: `Changed files:\n${fileList}${commitCtx}`,
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

	return {
		system: `You are an expert code reviewer. Provide an overall summary of this Pull Request.
Use the commit history to understand the development progression and intent.
Respond ONLY with a JSON object: {"purpose": "why this PR exists (1-2 sentences)", "scope": "what areas of code are affected", "impact": "what is the impact of these changes", "risk_level": "low|medium|high"}.
The "purpose", "scope", and "impact" values are human-readable text. The "risk_level" must be one of: low, medium, high (in English).
No markdown, no explanation, just the JSON object.${langDirective(ctx?.language)}`,
		user: `PR Title: ${prTitle}\n\nChange Groups:\n${groupList}\n\nFile Summaries:\n${fileList}${commitCtx}`,
	};
}

export function buildNarrativePrompt(
	prTitle: string,
	summary: PrSummary,
	groups: FileGroup[],
	ctx?: PromptContext,
): PromptPair {
	const groupDetails = groups
		.map((g) => `### ${g.name} (${g.type})\n${g.description}\nFiles: ${g.files.join(", ")}`)
		.join("\n\n");

	const commitCtx = ctx?.commits ? formatCommitHistory(ctx.commits) : "";
	const lang = ctx?.language && ctx.language !== "English" ? ctx.language : null;

	return {
		system: `You are an expert code reviewer writing a review walkthrough for other developers.
Write a clear, concise narrative that tells the "story" of this PR — what changes were made and in what logical order.
Use the commit history to understand the development progression: which changes came first, how the PR evolved, and the intent behind each step.
Use markdown formatting. Write 2-5 paragraphs. Do NOT use JSON. Write natural prose.
${lang ? `CRITICAL: Write the ENTIRE narrative in ${lang}. Every sentence must be in ${lang}. Do NOT use English except for code identifiers, file paths, and [[group:...]]/[[file:...]] tokens.` : "If the PR title is in a non-English language, write the narrative in that same language."}

IMPORTANT: When referencing a change group, wrap it as [[group:Group Name]]. When referencing a specific file, wrap it as [[file:path/to/file.ts]].
Use the EXACT group names and file paths provided. Every group MUST be referenced at least once. Reference key files where relevant.
Example: "The [[group:Auth Flow]] group introduces session management via [[file:src/auth/session.ts]] and [[file:src/auth/token.ts]]."`,
		user: `PR Title: ${prTitle}\n\nSummary:\n- Purpose: ${summary.purpose}\n- Scope: ${summary.scope}\n- Impact: ${summary.impact}\n- Risk: ${summary.risk_level}\n\nChange Groups:\n${groupDetails}${commitCtx}`,
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
): PromptPair {
	const base = buildNarrativePrompt(prTitle, summary, groups, ctx);
	const context = formatCodebaseContext(exploration);

	return {
		system: `${base.system}
You have access to full codebase analysis. Use it to explain HOW the changes relate to existing code, not just WHAT changed.
Mention specific existing functions, modules, or patterns that are affected.
Remember to use [[group:Name]] and [[file:path]] tokens as instructed.`,
		user: `${base.user}\n\n--- CODEBASE CONTEXT (from agentic exploration) ---\n${context}`,
	};
}
