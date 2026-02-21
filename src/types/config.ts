import type { AgentToolName } from "../workspace/types.ts";

export interface NewprConfig {
	openrouter_api_key: string;
	model: string;
	max_files: number;
	timeout: number;
	concurrency: number;
	language: string;
	agent?: AgentToolName;
	custom_prompt?: string;
}

export const DEFAULT_CONFIG: Omit<NewprConfig, "openrouter_api_key"> = {
	model: "anthropic/claude-sonnet-4.6",
	max_files: 100,
	timeout: 120,
	concurrency: 5,
	language: "auto",
};
