import type { NewprConfig } from "../types/config.ts";
import type { AgentToolName } from "../workspace/types.ts";
import { writeStoredConfig } from "../config/store.ts";
import { resolveLanguage } from "../config/index.ts";

export interface SlashCmd {
	name: string;
	args?: string;
	desc: string;
}

export const SLASH_CMDS: SlashCmd[] = [
	{ name: "language", args: "<lang>", desc: "Set output language (auto, Korean, English, ...)" },
	{ name: "agent", args: "<name>", desc: "Set exploration agent (auto, claude, opencode, codex)" },
	{ name: "auth", args: "<key>", desc: "Set OpenRouter API key" },
	{ name: "model", args: "<name>", desc: "Set LLM model" },
];

const VALID_AGENTS = new Set<string>(["claude", "opencode", "codex", "auto"]);

export function filterCommands(input: string): SlashCmd[] {
	const prefix = input.split(/\s/)[0]!.toLowerCase();
	return SLASH_CMDS.filter((c) => `/${c.name}`.startsWith(prefix));
}

export interface CmdResult {
	text: string;
	ok: boolean;
	configUpdate?: Partial<NewprConfig>;
}

export async function executeCommand(
	input: string,
	config: NewprConfig,
): Promise<CmdResult> {
	const parts = input.slice(1).split(/\s+/);
	const cmd = parts[0]?.toLowerCase() ?? "";
	const args = parts.slice(1).join(" ").trim();

	switch (cmd) {
		case "language":
		case "lang": {
			if (!args) return { text: `Language: ${config.language}`, ok: true };
			const resolved = resolveLanguage(args);
			await writeStoredConfig({ language: args });
			return { text: `Language → ${resolved}`, ok: true, configUpdate: { language: resolved } };
		}
		case "agent": {
			if (!args) return { text: `Agent: ${config.agent ?? "auto"}`, ok: true };
			if (!VALID_AGENTS.has(args.toLowerCase())) {
				return { text: `Unknown agent: ${args}. Use: auto, claude, opencode, codex`, ok: false };
			}
			const val = args.toLowerCase() === "auto" ? undefined : args.toLowerCase() as AgentToolName;
			await writeStoredConfig({ agent: val });
			return { text: `Agent → ${args.toLowerCase()}`, ok: true, configUpdate: { agent: val } };
		}
		case "auth": {
			if (!args) {
				const masked = config.openrouter_api_key
					? `${config.openrouter_api_key.slice(0, 10)}${"*".repeat(8)}`
					: "(not set)";
				return { text: `API key: ${masked}`, ok: true };
			}
			await writeStoredConfig({ openrouter_api_key: args });
			return { text: "API key updated", ok: true, configUpdate: { openrouter_api_key: args } };
		}
		case "model": {
			if (!args) return { text: `Model: ${config.model}`, ok: true };
			await writeStoredConfig({ model: args });
			return { text: `Model → ${args}`, ok: true, configUpdate: { model: args } };
		}
		default:
			return { text: `Unknown command: /${cmd}`, ok: false };
	}
}
