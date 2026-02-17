export type AgentToolName = "claude" | "opencode" | "codex";

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

export interface WorktreeSet {
	basePath: string;
	headPath: string;
}

export interface ExplorationResult {
	project_structure: string;
	related_code: string;
	potential_issues: string;
}

export const INSTALL_INSTRUCTIONS: Record<AgentToolName, string> = {
	claude: "npm install -g @anthropic-ai/claude-code",
	opencode: "npm install -g opencode",
	codex: "npm install -g @openai/codex",
};
