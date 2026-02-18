import type { AgentTool, AgentToolName } from "./types.ts";
import type { ExplorationResult } from "./types.ts";
import { runAgentWithFallback } from "./agent.ts";

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

interface PhaseConfig {
	label: string;
	emoji: string;
	step: number;
}

const PHASES: PhaseConfig[] = [
	{ label: "Project structure", emoji: "🏗", step: 1 },
	{ label: "Related code & dependencies", emoji: "🔗", step: 2 },
	{ label: "Potential issues", emoji: "🔍", step: 3 },
	{ label: "React Doctor analysis", emoji: "⚕️", step: 4 },
];

function fmtDuration(ms: number): string {
	const s = Math.round(ms / 1000);
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function hasReactFiles(changedFiles: string[]): boolean {
	return changedFiles.some((f) => f.endsWith(".tsx") || f.endsWith(".jsx"));
}

const REACT_DOCTOR_PROMPT = `Run react-doctor on this project to analyze React code quality.

Execute this command:
npx -y react-doctor@latest . --verbose

Return the FULL output including:
1. The overall score (0-100)
2. All diagnostics (errors, warnings)
3. File paths and line numbers for each issue

If npx is not available or the command fails, report the error.
Do NOT attempt to fix any issues — only report the results.`;

export async function exploreCodebase(
	agents: AgentTool[],
	headPath: string,
	changedFiles: string[],
	prTitle: string,
	diff: string,
	onProgress?: (msg: string, current?: number, total?: number) => void,
): Promise<ExplorationResult> {
	const timeout = 90_000;
	const totalStart = Date.now();
	const isReact = hasReactFiles(changedFiles);
	const totalPhases = isReact ? 4 : 3;
	let currentAgent: AgentToolName = agents[0]!.name;

	onProgress?.(`${currentAgent}: starting exploration of ${changedFiles.length} files (${agents.length} agent(s) available)`, 0, totalPhases);

	const runPhase = async (phase: PhaseConfig, prompt: string, total = totalPhases) => {
		const phaseStart = Date.now();
		let toolCount = 0;
		onProgress?.(`${phase.emoji} ${phase.label}...`, phase.step, total);
		const result = await runAgentWithFallback(agents, headPath, prompt, {
			timeout,
			onOutput: (line: string) => {
				toolCount++;
				onProgress?.(`[${phase.step}/${total}] ${line}`, phase.step, total);
			},
			onFallback: (from, to, reason) => {
				currentAgent = to;
				onProgress?.(`⚠️ ${from} failed (${reason}), falling back to ${to}...`, phase.step, total);
			},
		});
		const elapsed = fmtDuration(Date.now() - phaseStart);
		onProgress?.(`${phase.emoji} ${phase.label} done via ${result.tool_used} (${elapsed}, ${toolCount} tool calls)`, phase.step, total);
		return result;
	};

	const structureResult = await runPhase(PHASES[0]!, STRUCTURE_PROMPT);

	const relatedPrompt = buildRelatedCodePrompt(changedFiles, prTitle);
	const relatedResult = await runPhase(PHASES[1]!, relatedPrompt);

	const issuesPrompt = buildIssuesPrompt(changedFiles, diff);
	const issuesResult = await runPhase(PHASES[2]!, issuesPrompt);

	let reactDoctorResult: string | undefined;
	if (isReact) {
		try {
			const result = await runPhase(PHASES[3]!, REACT_DOCTOR_PROMPT);
			if (result.answer.trim()) {
				reactDoctorResult = result.answer;
			}
		} catch {
			onProgress?.("⚕️ React Doctor skipped (agent error)", 4, totalPhases);
		}
	}

	const totalElapsed = fmtDuration(Date.now() - totalStart);
	onProgress?.(`exploration complete (${totalElapsed})`, totalPhases, totalPhases);

	return {
		project_structure: structureResult.answer,
		related_code: relatedResult.answer,
		potential_issues: issuesResult.answer,
		react_doctor: reactDoctorResult,
	};
}
