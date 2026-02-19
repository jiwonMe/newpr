import { DEFAULT_CONFIG, type NewprConfig } from "../types/config.ts";
import { readStoredConfig, type StoredConfig } from "./store.ts";

export interface ConfigOverrides {
	model?: string;
	max_files?: number;
	timeout?: number;
	concurrency?: number;
	language?: string;
}

function parseIntOrDefault(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

const LOCALE_TO_LANGUAGE: Record<string, string> = {
	ko: "Korean",
	ja: "Japanese",
	zh: "Chinese",
	es: "Spanish",
	fr: "French",
	de: "German",
	pt: "Portuguese",
	ru: "Russian",
	it: "Italian",
	vi: "Vietnamese",
	th: "Thai",
	ar: "Arabic",
	hi: "Hindi",
	nl: "Dutch",
	pl: "Polish",
	tr: "Turkish",
	sv: "Swedish",
	en: "English",
};

export function detectLanguage(): string {
	const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "";
	const code = envLang.split(/[_.\-]/)[0]?.toLowerCase() ?? "";
	if (code && LOCALE_TO_LANGUAGE[code]) return LOCALE_TO_LANGUAGE[code]!;

	try {
		const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
		const intlCode = resolved.split("-")[0]?.toLowerCase() ?? "";
		if (intlCode && LOCALE_TO_LANGUAGE[intlCode]) return LOCALE_TO_LANGUAGE[intlCode]!;
	} catch {}

	return "English";
}

export function resolveLanguage(configured: string): string {
	if (configured === "auto") return detectLanguage();
	return configured;
}

export async function loadConfig(
	overrides?: ConfigOverrides,
	_readStore?: () => Promise<StoredConfig>,
): Promise<NewprConfig> {
	const stored = await (_readStore ?? readStoredConfig)();

	const apiKey = process.env.OPENROUTER_API_KEY || stored.openrouter_api_key || "";

	const agentVal = stored.agent as NewprConfig["agent"];
	const rawLang = process.env.NEWPR_LANGUAGE || stored.language || DEFAULT_CONFIG.language;

	const config: NewprConfig = {
		openrouter_api_key: apiKey,
		agent: agentVal === "claude" || agentVal === "opencode" || agentVal === "codex" ? agentVal : undefined,
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
		language: resolveLanguage(rawLang),
	};

	if (overrides) {
		if (overrides.model) config.model = overrides.model;
		if (overrides.max_files !== undefined) config.max_files = overrides.max_files;
		if (overrides.timeout !== undefined) config.timeout = overrides.timeout;
		if (overrides.concurrency !== undefined) config.concurrency = overrides.concurrency;
		if (overrides.language) config.language = resolveLanguage(overrides.language);
	}

	return config;
}
