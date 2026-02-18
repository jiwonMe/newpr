import type { AgentToolName } from "../workspace/types.ts";

export interface ToolStatus {
	name: string;
	installed: boolean;
	version?: string;
	detail?: string;
}

export interface PreflightResult {
	github: ToolStatus & { authenticated: boolean; user?: string };
	agents: ToolStatus[];
	openrouterKey: boolean;
}

async function which(cmd: string): Promise<string | null> {
	try {
		const result = await Bun.$`which ${cmd}`.text();
		return result.trim() || null;
	} catch {
		return null;
	}
}

async function getVersion(cmd: string, flag = "--version"): Promise<string | null> {
	try {
		const result = await Bun.$`${cmd} ${flag} 2>&1`.text();
		const match = result.match(/[\d]+\.[\d]+[\d.]*/);
		return match?.[0] ?? result.trim().slice(0, 30);
	} catch {
		return null;
	}
}

async function checkGithubCli(): Promise<PreflightResult["github"]> {
	const path = await which("gh");
	if (!path) {
		return { name: "gh", installed: false, authenticated: false, detail: "brew install gh" };
	}
	const version = await getVersion("gh");
	try {
		const status = await Bun.$`gh auth status 2>&1`.text();
		const userMatch = status.match(/Logged in to github\.com account (\S+)/i)
			?? status.match(/account (\S+)/i);
		return {
			name: "gh",
			installed: true,
			version: version ?? undefined,
			authenticated: true,
			user: userMatch?.[1]?.replace(/\s*\(.*/, ""),
		};
	} catch {
		return { name: "gh", installed: true, version: version ?? undefined, authenticated: false, detail: "gh auth login" };
	}
}

async function checkAgent(name: AgentToolName): Promise<ToolStatus> {
	const path = await which(name);
	if (!path) return { name, installed: false };
	const version = await getVersion(name);
	return { name, installed: true, version: version ?? undefined };
}

export async function runPreflight(): Promise<PreflightResult> {
	const [github, claude, cursor, gemini, opencode, codex] = await Promise.all([
		checkGithubCli(),
		checkAgent("claude"),
		checkAgent("cursor"),
		checkAgent("gemini"),
		checkAgent("opencode"),
		checkAgent("codex"),
	]);

	return {
		github,
		agents: [claude, cursor, gemini, opencode, codex],
		openrouterKey: !!(process.env.OPENROUTER_API_KEY || await hasStoredApiKey()),
	};
}

async function hasStoredApiKey(): Promise<boolean> {
	try {
		const { readStoredConfig } = await import("../config/store.ts");
		const stored = await readStoredConfig();
		return !!stored.openrouter_api_key;
	} catch {
		return false;
	}
}

export function printPreflight(result: PreflightResult): void {
	const check = "\x1b[32m✓\x1b[0m";
	const cross = "\x1b[31m✗\x1b[0m";
	const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

	console.log("");
	console.log(`  ${bold("Preflight")}`);
	console.log("");

	const gh = result.github;
	if (gh.installed && gh.authenticated) {
		console.log(`  ${check} gh ${dim(gh.version ?? "")} ${dim(`· ${gh.user ?? ""}`)}`);
	} else if (gh.installed) {
		console.log(`  ${cross} gh ${dim(gh.version ?? "")} ${dim("· not authenticated")}`);
		console.log(`    ${dim(`run: ${gh.detail}`)}`);
	} else {
		console.log(`  ${cross} gh ${dim("· not installed")}`);
		console.log(`    ${dim(`run: ${gh.detail}`)}`);
	}

	for (const agent of result.agents) {
		if (agent.installed) {
			console.log(`  ${check} ${agent.name} ${dim(agent.version ?? "")}`);
		} else {
			console.log(`  ${dim("·")} ${dim(agent.name)} ${dim("not found")}`);
		}
	}

	const hasAgent = result.agents.some((a) => a.installed);
	if (result.openrouterKey) {
		console.log(`  ${check} OpenRouter API key`);
	} else if (hasAgent) {
		console.log(`  ${dim("·")} OpenRouter API key ${dim("· not configured (using agent as LLM fallback)")}`);
	} else {
		console.log(`  ${cross} OpenRouter API key ${dim("· not configured")}`);
		console.log(`    ${dim("run: newpr auth  —or—  install an agent (claude, gemini, etc.)")}`);
	}

	console.log("");
}
