import type { AgentTool } from "./types.ts";
import type { ExplorationResult } from "./types.ts";
import { runAgent } from "./agent.ts";

const STRUCTURE_PROMPT = `Analyze the project structure of this repository concisely.
Return:
1. What kind of project this is (language, framework, purpose)
2. The key directories and what they contain
3. Important config files and what they indicate
4. The overall architecture pattern (monorepo, MVC, microservices, etc.)
Keep it under 500 words. Focus on facts, not opinions.`;

function buildRelatedCodePrompt(changedFiles: string[], prTitle: string): string {
	const fileList = changedFiles.slice(0, 30).join("\n  ");
	return `These files were changed in a PR titled "${prTitle}":
  ${fileList}

For each changed file, find:
1. What imports it / what it imports (direct dependencies)
2. Key functions or classes it defines and where they are used
3. Any tests that cover this file

Be concise. Focus on the most important relationships. Under 800 words total.`;
}

function buildIssuesPrompt(changedFiles: string[], diff: string): string {
	const truncatedDiff = diff.length > 12000 ? `${diff.slice(0, 12000)}\n\n... (diff truncated)` : diff;
	return `Review this PR diff for potential issues. The changed files are:
${changedFiles.slice(0, 20).join(", ")}

Diff:
\`\`\`
${truncatedDiff}
\`\`\`

Look at the actual codebase (not just the diff) to check:
1. Are there breaking changes to public APIs that callers depend on?
2. Are there missing error handling patterns that the rest of the codebase uses?
3. Are there inconsistencies with existing code patterns/conventions?
4. Are there missing test updates for changed functionality?

Only report real issues you can verify from the codebase. No speculation. Under 600 words.`;
}

const PHASE_LABELS = ["Analyzing project structure", "Finding related code", "Checking for issues"] as const;

export async function exploreCodebase(
	agent: AgentTool,
	headPath: string,
	changedFiles: string[],
	prTitle: string,
	diff: string,
	onProgress?: (msg: string, current?: number, total?: number) => void,
): Promise<ExplorationResult> {
	const timeout = 90_000;

	onProgress?.(`${PHASE_LABELS[0]}...`, 1, 3);
	const structureResult = await runAgent(agent, headPath, STRUCTURE_PROMPT, {
		timeout,
		onOutput: (line) => onProgress?.(`[1/3] ${line}`, 1, 3),
	});

	onProgress?.(`${PHASE_LABELS[1]}...`, 2, 3);
	const relatedPrompt = buildRelatedCodePrompt(changedFiles, prTitle);
	const relatedResult = await runAgent(agent, headPath, relatedPrompt, {
		timeout,
		onOutput: (line) => onProgress?.(`[2/3] ${line}`, 2, 3),
	});

	onProgress?.(`${PHASE_LABELS[2]}...`, 3, 3);
	const issuesPrompt = buildIssuesPrompt(changedFiles, diff);
	const issuesResult = await runAgent(agent, headPath, issuesPrompt, {
		timeout,
		onOutput: (line) => onProgress?.(`[3/3] ${line}`, 3, 3),
	});

	return {
		project_structure: structureResult.answer,
		related_code: relatedResult.answer,
		potential_issues: issuesResult.answer,
	};
}
