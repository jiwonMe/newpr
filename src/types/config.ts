export interface NewprConfig {
	openrouter_api_key: string;
	model: string;
	max_files: number;
	timeout: number;
	concurrency: number;
}

export const DEFAULT_CONFIG: Omit<NewprConfig, "openrouter_api_key"> = {
	model: "anthropic/claude-sonnet-4",
	max_files: 100,
	timeout: 120,
	concurrency: 5,
};
