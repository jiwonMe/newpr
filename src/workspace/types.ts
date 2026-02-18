export type AgentToolName = "claude" | "cursor" | "gemini" | "opencode" | "codex";

export interface AgentTool {
	name: AgentToolName;
	path: string;
}

export interface AgentResult {
	answer: string;
	cost_usd?: number;
	duration_ms: number;
	tool_used: AgentToolName;
}

export class AgentError extends Error {
	constructor(
		public readonly agentName: AgentToolName,
		public readonly reason: "empty_answer" | "non_zero_exit" | "rate_limit" | "timeout" | "unknown",
		message: string,
	) {
		super(message);
		this.name = "AgentError";
	}
}

export interface WorktreeSet {
	basePath: string;
	headPath: string;
}

export interface ExplorationResult {
	project_structure: string;
	related_code: string;
	potential_issues: string;
	react_doctor?: string;
}

export const INSTALL_INSTRUCTIONS: Record<AgentToolName, string> = {
	claude: "npm install -g @anthropic-ai/claude-code",
	cursor: "curl https://cursor.com/install -fsS | bash",
	gemini: "npm install -g @google/gemini-cli",
	opencode: "npm install -g opencode-ai",
	codex: "npm install -g @openai/codex",
};
