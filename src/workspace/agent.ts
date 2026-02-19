import type { AgentTool, AgentToolName, AgentResult } from "./types.ts";
import { AgentError, INSTALL_INSTRUCTIONS } from "./types.ts";

const AGENT_PRIORITY: AgentToolName[] = ["claude", "cursor", "gemini", "opencode", "codex"];

const DETECTION_COMMANDS: Record<AgentToolName, string> = {
	claude: "claude",
	cursor: "agent",
	gemini: "gemini",
	opencode: "opencode",
	codex: "codex",
};

async function which(cmd: string): Promise<string | null> {
	try {
		const result = await Bun.$`which ${cmd}`.text();
		const path = result.trim();
		return path || null;
	} catch {
		return null;
	}
}

export async function detectAgents(): Promise<AgentTool[]> {
	const agents: AgentTool[] = [];

	for (const name of AGENT_PRIORITY) {
		const path = await which(DETECTION_COMMANDS[name]);
		if (path) {
			agents.push({ name, path });
		}
	}

	return agents;
}

export async function requireAgent(preferred?: AgentToolName): Promise<AgentTool> {
	const agents = await detectAgents();

	if (preferred) {
		const found = agents.find((a) => a.name === preferred);
		if (found) return found;

		const instruction = INSTALL_INSTRUCTIONS[preferred];
		throw new Error(
			`Agent "${preferred}" is not installed.\n\n` +
			`Install it with:\n  ${instruction}\n\n` +
			`Or use one of these available agents: ${agents.map((a) => a.name).join(", ") || "(none installed)"}`,
		);
	}

	if (agents.length > 0) {
		return agents[0]!;
	}

	const installList = AGENT_PRIORITY
		.map((name) => `  ${name}: ${INSTALL_INSTRUCTIONS[name]}`)
		.join("\n");

	throw new Error(
		"No agentic coding tool found.\n\n" +
		"newpr requires at least one of the following tools for codebase exploration:\n\n" +
		`${installList}\n\n` +
		"Install any one of them and try again.",
	);
}

export async function getAvailableAgents(preferred?: AgentToolName): Promise<AgentTool[]> {
	const agents = await detectAgents();

	if (agents.length === 0) {
		const installList = AGENT_PRIORITY
			.map((name) => `  ${name}: ${INSTALL_INSTRUCTIONS[name]}`)
			.join("\n");
		throw new Error(
			"No agentic coding tool found.\n\n" +
			"newpr requires at least one of the following tools for codebase exploration:\n\n" +
			`${installList}\n\n` +
			"Install any one of them and try again.",
		);
	}

	if (preferred) {
		const idx = agents.findIndex((a) => a.name === preferred);
		if (idx > 0) {
			const [pref] = agents.splice(idx, 1);
			agents.unshift(pref!);
		}
	}

	return agents;
}

interface RunOptions {
	timeout?: number;
	allowedTools?: string[];
	onOutput?: (line: string) => void;
}

const RATE_LIMIT_PATTERNS = [
	/rate.?limit/i,
	/too many requests/i,
	/429/,
	/capacity.*available/i,
	/quota.*exceeded/i,
	/overloaded/i,
];

function isRateLimitError(text: string): boolean {
	return RATE_LIMIT_PATTERNS.some((p) => p.test(text));
}

function validateResult(agent: AgentTool, result: AgentResult): AgentResult {
	const cleanedAnswer = result.answer
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\u001b/g, "")
		.trim();

	const normalized: AgentResult = {
		...result,
		answer: cleanedAnswer,
	};

	if (isRateLimitError(normalized.answer)) {
		throw new AgentError(agent.name, "rate_limit", `${agent.name}: rate limited — ${normalized.answer.slice(0, 200)}`);
	}
	if (!normalized.answer.trim()) {
		throw new AgentError(agent.name, "empty_answer", `${agent.name}: returned empty answer`);
	}
	return normalized;
}

export async function runAgentWithFallback(
	agents: AgentTool[],
	workdir: string,
	prompt: string,
	options?: RunOptions & { onFallback?: (from: AgentToolName, to: AgentToolName, reason: string) => void },
): Promise<AgentResult> {
	if (agents.length === 0) {
		throw new Error("No agents available");
	}

	const errors: Array<{ agent: AgentToolName; error: string }> = [];

	for (const agent of agents) {
		try {
			const raw = await runAgent(agent, workdir, prompt, options);
			return validateResult(agent, raw);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			errors.push({ agent: agent.name, error: msg });

			const nextAgent = agents[agents.indexOf(agent) + 1];
			if (nextAgent) {
				const reason = err instanceof AgentError ? err.reason : "unknown";
				options?.onFallback?.(agent.name, nextAgent.name, reason);
			}
		}
	}

	const summary = errors.map((e) => `  ${e.agent}: ${e.error}`).join("\n");
	throw new Error(`All agents failed:\n${summary}`);
}

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

async function streamLines(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const raw of lines) {
			const line = stripAnsi(raw).trim();
			if (line) onLine(line);
		}
	}

	const tail = stripAnsi(buffer).trim();
	if (tail) onLine(tail);
}

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
	Read: (i) => `📄 Read ${truncPath(i.file_path as string ?? i.filePath as string ?? "")}`,
	Write: (i) => `✏️ Write ${truncPath(i.file_path as string ?? i.filePath as string ?? "")}`,
	Edit: (i) => `✏️ Edit ${truncPath(i.file_path as string ?? i.filePath as string ?? "")}`,
	Glob: (i) => `🔎 Glob ${i.pattern as string ?? ""}`,
	Grep: (i) => `🔎 Grep "${(i.pattern as string ?? "").slice(0, 40)}"${i.include ? ` in ${i.include}` : ""}`,
	Bash: (i) => {
		const cmd = (i.command as string ?? "").slice(0, 60);
		return `$ ${cmd}`;
	},
	ListFiles: (i) => `📂 List ${truncPath(i.path as string ?? ".")}`,
	Search: (i) => `🔎 Search "${(i.query as string ?? "").slice(0, 40)}"`,
	WebSearch: () => "🌐 Web search",
	WebFetch: (i) => `🌐 Fetch ${(i.url as string ?? "").slice(0, 50)}`,
};

function truncPath(p: string): string {
	if (p.length <= 50) return p;
	const parts = p.split("/");
	if (parts.length <= 3) return `…${p.slice(-47)}`;
	return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

function formatToolUse(name: string, input: Record<string, unknown>): string | null {
	const formatter = TOOL_LABELS[name];
	if (formatter) return formatter(input);
	return `${name}`;
}

export async function runAgent(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	options?: RunOptions,
): Promise<AgentResult> {
	const timeout = options?.timeout ?? 60_000;

	switch (agent.name) {
		case "claude":
			return runClaude(agent, workdir, prompt, timeout, options?.onOutput);
		case "cursor":
			return runCursor(agent, workdir, prompt, timeout, options?.onOutput);
		case "gemini":
			return runGemini(agent, workdir, prompt, timeout, options?.onOutput);
		case "opencode":
			return runOpencode(agent, workdir, prompt, timeout, options?.onOutput);
		case "codex":
			return runCodex(agent, workdir, prompt, timeout, options?.onOutput);
	}
}

async function runClaude(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	timeout: number,
	onOutput?: (line: string) => void,
): Promise<AgentResult> {
	const start = Date.now();
	const proc = Bun.spawn(
		[
			agent.path,
			"-p",
			"--output-format", "stream-json",
			"--permission-mode", "bypassPermissions",
			"--allowedTools", "Read", "Glob", "Grep", "Bash(find:*)", "Bash(wc:*)", "Bash(head:*)", "WebSearch", "WebFetch",
			prompt,
		],
		{
			cwd: workdir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		},
	);

	let answer = "";
	let costUsd: number | undefined;

	const stdoutPromise = proc.stdout
		? streamLines(proc.stdout, (line) => {
			try {
				const event = JSON.parse(line);
				if (event.type === "assistant" && event.message?.content) {
					for (const block of event.message.content) {
						if (block.type === "tool_use" && onOutput) {
							const label = formatToolUse(
								block.name ?? "",
								(block.input as Record<string, unknown>) ?? {},
							);
							if (label) onOutput(label);
						}
						if (block.type === "text" && block.text && onOutput) {
							const firstLine = (block.text as string).split("\n")[0]?.trim();
							if (firstLine && firstLine.length > 5) {
								onOutput(`💭 ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "…" : ""}`);
							}
						}
					}
				} else if (event.type === "result") {
					answer = event.result ?? "";
					costUsd = event.cost_usd ?? event.total_cost_usd;
				}
			} catch {
			}
		})
		: Promise.resolve();

	const timeoutId = setTimeout(() => proc.kill(), timeout);
	await stdoutPromise;
	clearTimeout(timeoutId);

	const duration = Date.now() - start;

	return {
		answer,
		cost_usd: costUsd,
		duration_ms: duration,
		tool_used: agent.name,
	};
}

async function runCursor(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	timeout: number,
	onOutput?: (line: string) => void,
): Promise<AgentResult> {
	const start = Date.now();
	const proc = Bun.spawn(
		[
			agent.path,
			"-p",
			"--output-format", "stream-json",
			"--force",
			"--mode", "ask",
			prompt,
		],
		{
			cwd: workdir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		},
	);

	let answer = "";

	const stdoutPromise = proc.stdout
		? streamLines(proc.stdout, (line) => {
			try {
				const event = JSON.parse(line);
				if (event.type === "assistant" && event.message?.content) {
					for (const block of event.message.content) {
						if (block.type === "tool_use" && onOutput) {
							const label = formatToolUse(
								block.name ?? "",
								(block.input as Record<string, unknown>) ?? {},
							);
							if (label) onOutput(label);
						}
						if (block.type === "text" && block.text && onOutput) {
							const firstLine = (block.text as string).split("\n")[0]?.trim();
							if (firstLine && firstLine.length > 5) {
								onOutput(`💭 ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "…" : ""}`);
							}
						}
					}
				} else if (event.type === "result") {
					answer = event.result ?? "";
				}
			} catch {}
		})
		: Promise.resolve();

	const timeoutId = setTimeout(() => proc.kill(), timeout);
	await stdoutPromise;
	clearTimeout(timeoutId);

	const duration = Date.now() - start;

	return { answer, duration_ms: duration, tool_used: agent.name };
}

async function runGemini(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	timeout: number,
	onOutput?: (line: string) => void,
): Promise<AgentResult> {
	const start = Date.now();
	const proc = Bun.spawn(
		[agent.path, "-p", prompt],
		{
			cwd: workdir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	const stderrPromise = onOutput && proc.stderr
		? streamLines(proc.stderr, onOutput)
		: Promise.resolve();

	const timeoutId = setTimeout(() => proc.kill(), timeout);
	const output = await new Response(proc.stdout).text();
	await stderrPromise;
	clearTimeout(timeoutId);

	const duration = Date.now() - start;

	return {
		answer: output.trim(),
		duration_ms: duration,
		tool_used: agent.name,
	};
}

async function runOpencode(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	timeout: number,
	onOutput?: (line: string) => void,
): Promise<AgentResult> {
	const start = Date.now();
	const proc = Bun.spawn(
		[agent.path, workdir, "run", "--format", "json", prompt],
		{
			cwd: workdir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	const stderrPromise = onOutput && proc.stderr
		? streamLines(proc.stderr, onOutput)
		: Promise.resolve();

	const timeoutId = setTimeout(() => proc.kill(), timeout);
	const output = await new Response(proc.stdout).text();
	await stderrPromise;
	clearTimeout(timeoutId);

	const duration = Date.now() - start;

	const lines = output.trim().split("\n");
	const lastLine = lines[lines.length - 1] ?? "";
	try {
		const json = JSON.parse(lastLine);
		return {
			answer: json.content ?? json.text ?? lastLine,
			duration_ms: duration,
			tool_used: agent.name,
		};
	} catch {
		return {
			answer: output.trim(),
			duration_ms: duration,
			tool_used: agent.name,
		};
	}
}

async function runCodex(
	agent: AgentTool,
	workdir: string,
	prompt: string,
	timeout: number,
	onOutput?: (line: string) => void,
): Promise<AgentResult> {
	const start = Date.now();
	const proc = Bun.spawn(
		[
			agent.path, "exec",
			"--json",
			"--dangerously-bypass-approvals-and-sandbox",
			"-C", workdir,
			prompt,
		],
		{
			cwd: workdir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		},
	);

	let answer = "";

	const stdoutPromise = proc.stdout
		? streamLines(proc.stdout, (line) => {
			try {
				const event = JSON.parse(line);
				if (event.type === "item.completed" && event.item) {
					if (event.item.type === "tool_call" && onOutput) {
						const name = event.item.name ?? event.item.tool ?? "";
						const args = event.item.arguments ?? event.item.input ?? {};
						const parsed = typeof args === "string" ? JSON.parse(args) : args;
						const label = formatToolUse(name, parsed as Record<string, unknown>);
						if (label) onOutput(label);
					}
					if (event.item.type === "agent_message" && event.item.text) {
						answer = event.item.text;
						if (onOutput) {
							const firstLine = (event.item.text as string).split("\n")[0]?.trim();
							if (firstLine && firstLine.length > 5) {
								onOutput(`💭 ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "…" : ""}`);
							}
						}
					}
				}
			} catch {
			}
		})
		: Promise.resolve();

	const timeoutId = setTimeout(() => proc.kill(), timeout);
	await stdoutPromise;
	clearTimeout(timeoutId);

	const duration = Date.now() - start;

	return {
		answer,
		duration_ms: duration,
		tool_used: agent.name,
	};
}
