import type { DiffChunk } from "../types/diff.ts";
import type { FileGroup, FileStatus, PrSummary } from "../types/output.ts";

export interface PromptPair {
	system: string;
	user: string;
}

export interface FileSummaryInput {
	path: string;
	summary: string;
	status: FileStatus;
}

export function buildFileSummaryPrompt(chunks: DiffChunk[]): PromptPair {
	const fileList = chunks
		.map((c) => {
			if (c.is_binary) return `File: ${c.file_path} (binary file, ${c.status})`;
			return `File: ${c.file_path} (${c.status}, +${c.additions}/-${c.deletions})\n\`\`\`diff\n${c.diff_content}\n\`\`\``;
		})
		.join("\n\n---\n\n");

	return {
		system: `You are an expert code reviewer. Analyze the given diff and provide a 1-line summary for each changed file.
Respond ONLY with a JSON array. Each element: {"path": "file/path", "summary": "one line description of what changed"}.
No markdown, no explanation, just the JSON array.`,
		user: fileList,
	};
}

export function buildGroupingPrompt(fileSummaries: FileSummaryInput[]): PromptPair {
	const fileList = fileSummaries
		.map((f) => `- ${f.path} (${f.status}): ${f.summary}`)
		.join("\n");

	return {
		system: `You are an expert code reviewer. Group the following changed files by their semantic purpose.
Each group should have a descriptive name, a type (one of: feature, refactor, bugfix, chore, docs, test, config), a description, and a list of file paths.
Respond ONLY with a JSON array. Each element: {"name": "group name", "type": "feature|refactor|bugfix|chore|docs|test|config", "description": "what this group of changes does", "files": ["path1", "path2"]}.
Every file must appear in exactly one group. No markdown, no explanation, just the JSON array.`,
		user: `Changed files:\n${fileList}`,
	};
}

export function buildOverallSummaryPrompt(
	prTitle: string,
	groups: FileGroup[],
	fileSummaries: Array<{ path: string; summary: string }>,
): PromptPair {
	const groupList = groups
		.map((g) => `- [${g.type}] ${g.name}: ${g.description} (${g.files.length} files)`)
		.join("\n");

	const fileList = fileSummaries.map((f) => `- ${f.path}: ${f.summary}`).join("\n");

	return {
		system: `You are an expert code reviewer. Provide an overall summary of this Pull Request.
Respond ONLY with a JSON object: {"purpose": "why this PR exists (1-2 sentences)", "scope": "what areas of code are affected", "impact": "what is the impact of these changes", "risk_level": "low|medium|high"}.
No markdown, no explanation, just the JSON object.`,
		user: `PR Title: ${prTitle}\n\nChange Groups:\n${groupList}\n\nFile Summaries:\n${fileList}`,
	};
}

export function buildNarrativePrompt(
	prTitle: string,
	summary: PrSummary,
	groups: FileGroup[],
): PromptPair {
	const groupDetails = groups
		.map((g) => `### ${g.name} (${g.type})\n${g.description}\nFiles: ${g.files.join(", ")}`)
		.join("\n\n");

	return {
		system: `You are an expert code reviewer writing a review walkthrough for other developers.
Write a clear, concise narrative that tells the "story" of this PR — what changes were made and in what logical order.
Use markdown formatting. Write 2-5 paragraphs. Do NOT use JSON. Write natural prose.
If the PR title is in a non-English language, write the narrative in that same language.`,
		user: `PR Title: ${prTitle}\n\nSummary:\n- Purpose: ${summary.purpose}\n- Scope: ${summary.scope}\n- Impact: ${summary.impact}\n- Risk: ${summary.risk_level}\n\nChange Groups:\n${groupDetails}`,
	};
}
