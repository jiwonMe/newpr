import { DEFAULT_CONFIG, type NewprConfig } from "../types/config.ts";
import { readStoredConfig } from "./store.ts";

export interface ConfigOverrides {
	model?: string;
	max_files?: number;
	timeout?: number;
	concurrency?: number;
}

function parseIntOrDefault(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

export async function loadConfig(overrides?: ConfigOverrides): Promise<NewprConfig> {
	const stored = await readStoredConfig();

	const apiKey = process.env.OPENROUTER_API_KEY || stored.openrouter_api_key;
	if (!apiKey) {
		throw new Error(
			"OPENROUTER_API_KEY is not set. Run `newpr auth` to configure, or set the environment variable.",
		);
	}

	const config: NewprConfig = {
		openrouter_api_key: apiKey,
		model:
			process.env.NEWPR_MODEL || stored.model || DEFAULT_CONFIG.model,
		max_files: parseIntOrDefault(
			process.env.NEWPR_MAX_FILES,
			stored.max_files ?? DEFAULT_CONFIG.max_files,
		),
		timeout: parseIntOrDefault(
			process.env.NEWPR_TIMEOUT,
			stored.timeout ?? DEFAULT_CONFIG.timeout,
		),
		concurrency: parseIntOrDefault(
			process.env.NEWPR_CONCURRENCY,
			stored.concurrency ?? DEFAULT_CONFIG.concurrency,
		),
	};

	if (overrides) {
		if (overrides.model) config.model = overrides.model;
		if (overrides.max_files !== undefined) config.max_files = overrides.max_files;
		if (overrides.timeout !== undefined) config.timeout = overrides.timeout;
		if (overrides.concurrency !== undefined) config.concurrency = overrides.concurrency;
	}

	return config;
}
