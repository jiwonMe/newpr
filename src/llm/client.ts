export interface LlmClientOptions {
	api_key: string;
	model: string;
	timeout: number;
}

export interface LlmUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface LlmResponse {
	content: string;
	model: string;
	usage: LlmUsage;
}

export type StreamChunkCallback = (chunk: string, accumulated: string) => void;

export interface LlmClient {
	complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse>;
	completeStream(
		systemPrompt: string,
		userPrompt: string,
		onChunk: StreamChunkCallback,
	): Promise<LlmResponse>;
}

interface OpenRouterResponse {
	choices: Array<{ message: { content: string } }>;
	model: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenRouterStreamChunk {
	choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
	model?: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

class NonRetriableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NonRetriableError";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestInit(
	options: LlmClientOptions,
	systemPrompt: string,
	userPrompt: string,
	stream: boolean,
	signal: AbortSignal,
): RequestInit {
	return {
		method: "POST",
		signal,
		headers: {
			Authorization: `Bearer ${options.api_key}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://github.com/sionic/newpr",
			"X-Title": "newpr",
		},
		body: JSON.stringify({
			model: options.model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: 0.1,
			...(stream ? { stream: true } : {}),
		}),
	};
}

async function fetchWithRetry(
	options: LlmClientOptions,
	systemPrompt: string,
	userPrompt: string,
	stream: boolean,
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
			await sleep(delay);
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), options.timeout * 1000);

		try {
			const response = await fetch(
				"https://openrouter.ai/api/v1/chat/completions",
				buildRequestInit(options, systemPrompt, userPrompt, stream, controller.signal),
			);

			clearTimeout(timeoutId);

			if (
				response.status === 429 ||
				response.status === 500 ||
				response.status === 502 ||
				response.status === 503
			) {
				lastError = new Error(
					`OpenRouter ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
				);
				continue;
			}

			if (!response.ok) {
				const body = await response.text();
				throw new NonRetriableError(`OpenRouter API error ${response.status}: ${body}`);
			}

			return response;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof NonRetriableError) {
				throw error;
			}
			if (error instanceof DOMException && error.name === "AbortError") {
				throw new Error(`OpenRouter request timed out after ${options.timeout}s`);
			}
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt === MAX_RETRIES) break;
		}
	}

	throw lastError ?? new Error("OpenRouter request failed after retries");
}

function parseUsage(
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): LlmUsage {
	return {
		prompt_tokens: usage?.prompt_tokens ?? 0,
		completion_tokens: usage?.completion_tokens ?? 0,
		total_tokens: usage?.total_tokens ?? 0,
	};
}

async function readStream(
	response: Response,
	onChunk: StreamChunkCallback,
): Promise<LlmResponse> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let accumulated = "";
	let model = "";
	let usage: LlmUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed === "data: [DONE]") continue;
				if (!trimmed.startsWith("data: ")) continue;

				try {
					const chunk = JSON.parse(trimmed.slice(6)) as OpenRouterStreamChunk;
					if (chunk.model) model = chunk.model;
					if (chunk.usage) usage = parseUsage(chunk.usage);

					const delta = chunk.choices[0]?.delta?.content;
					if (delta) {
						accumulated += delta;
						onChunk(delta, accumulated);
					}
				} catch {
					// skip malformed SSE chunks
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	if (!accumulated) {
		throw new NonRetriableError("OpenRouter returned empty streaming response");
	}

	return { content: accumulated, model, usage };
}

function createOpenRouterClient(options: LlmClientOptions): LlmClient {
	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			const response = await fetchWithRetry(options, systemPrompt, userPrompt, false);
			const data = (await response.json()) as OpenRouterResponse;
			const content = data.choices[0]?.message?.content;
			if (!content) {
				throw new NonRetriableError("OpenRouter returned empty response");
			}
			return {
				content,
				model: data.model,
				usage: parseUsage(data.usage),
			};
		},

		async completeStream(
			systemPrompt: string,
			userPrompt: string,
			onChunk: StreamChunkCallback,
		): Promise<LlmResponse> {
			const response = await fetchWithRetry(options, systemPrompt, userPrompt, true);
			return readStream(response, onChunk);
		},
	};
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
	if (options.api_key) {
		return createOpenRouterClient(options);
	}

	const { createClaudeCodeClient: create } = require("./claude-code-client.ts");
	return create(options.timeout);
}

export function hasApiKey(options: LlmClientOptions): boolean {
	return !!options.api_key;
}

export interface ChatTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ChatToolCallDelta {
	id: string;
	name: string;
	arguments: string;
}

export interface ChatStreamEvent {
	type: "text" | "tool_call" | "tool_result" | "done" | "error";
	content?: string;
	toolCall?: ChatToolCallDelta;
	toolResult?: { id: string; result: string };
	error?: string;
}

export type ChatStreamCallback = (event: ChatStreamEvent) => void;

interface OpenRouterChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | null;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
}

interface OpenRouterStreamToolCallDelta {
	index?: number;
	id?: string;
	type?: string;
	function?: { name?: string; arguments?: string };
}

interface OpenRouterStreamChunkWithTools {
	choices: Array<{
		delta: {
			content?: string;
			tool_calls?: OpenRouterStreamToolCallDelta[];
		};
		finish_reason?: string | null;
	}>;
	model?: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// Structured logger for chat pipeline debugging
function chatLog(level: "info" | "warn" | "error", round: number, event: string, data?: Record<string, unknown>): void {
	const ts = new Date().toISOString().slice(11, 23);
	const parts = Object.entries(data ?? {}).map(([k, v]) => {
		if (typeof v === "string" && v.length > 200) return `${k}=${v.length}chars`;
		return `${k}=${JSON.stringify(v)}`;
	}).join(" ");
	const msg = `[chat R${round}] ${event}${parts ? " " + parts : ""}`;
	if (level === "error") console.error(`${ts} \x1b[31m${msg}\x1b[0m`);
	else if (level === "warn") console.error(`${ts} \x1b[33m${msg}\x1b[0m`);
	else console.error(`${ts} \x1b[2m${msg}\x1b[0m`);
}

export async function chatWithTools(
	options: LlmClientOptions,
	messages: OpenRouterChatMessage[],
	tools: ChatTool[],
	executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
	onEvent: ChatStreamCallback,
): Promise<void> {
	const MAX_TOOL_ROUNDS = 10;
	const chatStart = Date.now();
	const msgCount = messages.length;
	const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
	const preview = typeof lastUserMsg?.content === "string" ? lastUserMsg.content.slice(0, 80) : "(no user msg)";
	chatLog("info", 0, "START", { model: options.model, messages: msgCount, timeout: options.timeout, preview });

	let currentMessages = [...messages];
	let totalToolCalls = 0;

	for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
		const roundStart = Date.now();
		const MAX_RETRIES = 2;
		let response: Response | undefined;
		let lastError: string | undefined;

		// --- Fetch OpenRouter with retry ---
		for (let retry = 0; retry <= MAX_RETRIES; retry++) {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), options.timeout * 1000);

			if (retry > 0) chatLog("warn", round, "RETRY", { attempt: retry + 1, lastError });
			chatLog("info", round, "OPENROUTER_REQ", { msgCount: currentMessages.length, retry });

			try {
				response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
					method: "POST",
					signal: controller.signal,
					headers: {
						Authorization: `Bearer ${options.api_key}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://github.com/sionic/newpr",
						"X-Title": "newpr",
					},
					body: JSON.stringify({
						model: options.model,
						messages: currentMessages,
						tools: tools.length > 0 ? tools : undefined,
						temperature: 0.3,
						stream: true,
					}),
				});
				clearTimeout(timeoutId);
				chatLog("info", round, "OPENROUTER_RES", { status: response.status, duration: `${Date.now() - roundStart}ms` });
			} catch (err) {
				clearTimeout(timeoutId);
				lastError = err instanceof Error ? err.message : String(err);
				chatLog("error", round, "OPENROUTER_FETCH_ERR", { error: lastError, retry, duration: `${Date.now() - roundStart}ms` });
				if (retry < MAX_RETRIES) {
					await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
					continue;
				}
				onEvent({ type: "error", error: `Network error after ${MAX_RETRIES + 1} attempts: ${lastError}` });
				return;
			}

			if (!response!.ok) {
				const body = await response!.text();
				const status = response!.status;
				chatLog("error", round, "OPENROUTER_HTTP_ERR", { status, body: body.slice(0, 300), retry });
				if (status === 429 || status >= 500) {
					lastError = `HTTP ${status}: ${body}`;
					if (retry < MAX_RETRIES) {
						await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
						continue;
					}
				}
				onEvent({ type: "error", error: `OpenRouter API error ${status}: ${body}` });
				return;
			}

			break;
		}

		// --- Stream reading ---
		const streamStart = Date.now();
		const reader = response!.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let textContent = "";
		let textChunks = 0;
		const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed === "data: [DONE]") continue;
					if (!trimmed.startsWith("data: ")) continue;

					try {
						const chunk = JSON.parse(trimmed.slice(6)) as OpenRouterStreamChunkWithTools;
						const delta = chunk.choices[0]?.delta;
						if (!delta) continue;

						if (delta.content) {
							textContent += delta.content;
							textChunks++;
							onEvent({ type: "text", content: delta.content });
						}

						if (delta.tool_calls) {
							for (const tc of delta.tool_calls) {
								const idx = tc.index ?? 0;
								if (!toolCalls.has(idx)) {
									toolCalls.set(idx, { id: tc.id ?? "", name: "", arguments: "" });
								}
								const entry = toolCalls.get(idx)!;
								if (tc.id) entry.id = tc.id;
								if (tc.function?.name) entry.name += tc.function.name;
								if (tc.function?.arguments) entry.arguments += tc.function.arguments;
							}
						}
					} catch {}
				}
			}
		} catch (streamErr) {
			const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
			chatLog("error", round, "STREAM_ERR", {
				error: errMsg,
				duration: `${Date.now() - streamStart}ms`,
				textChunks,
				textLen: textContent.length,
				toolCallsParsed: toolCalls.size,
			});
			if (textContent.trim()) {
				onEvent({ type: "error", error: `Connection lost after partial response (${textChunks} chunks, ${toolCalls.size} tool calls). The response so far has been preserved.` });
			} else {
				onEvent({ type: "error", error: `Stream disconnected: ${errMsg}` });
			}
			return;
		} finally {
			reader.releaseLock();
		}

		chatLog("info", round, "STREAM_DONE", {
			duration: `${Date.now() - streamStart}ms`,
			textChunks,
			textLen: textContent.length,
			toolCalls: toolCalls.size,
			tools: [...toolCalls.values()].map(tc => tc.name).join(",") || "(none)",
		});

		if (toolCalls.size === 0) {
			chatLog("info", round, "COMPLETE_NO_TOOLS", { totalDuration: `${Date.now() - chatStart}ms`, totalToolCalls });
			onEvent({ type: "done" });
			return;
		}

		// --- Tool execution ---
		const assistantMsg: OpenRouterChatMessage = {
			role: "assistant",
			content: textContent || null,
			tool_calls: [...toolCalls.values()].map((tc) => ({
				id: tc.id,
				type: "function" as const,
				function: { name: tc.name, arguments: tc.arguments },
			})),
		};
		currentMessages.push(assistantMsg);

		for (const tc of toolCalls.values()) {
			onEvent({
				type: "tool_call",
				toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments },
			});

			let args: Record<string, unknown> = {};
			try { args = JSON.parse(tc.arguments); } catch {}

			const toolStart = Date.now();
			const argPreview = Object.entries(args).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(" ");
			chatLog("info", round, "TOOL_EXEC_START", { name: tc.name, id: tc.id.slice(-8), args: argPreview });

			let result: string;
			try {
				result = await executeTool(tc.name, args);
				const dur = Date.now() - toolStart;
				chatLog("info", round, "TOOL_EXEC_DONE", { name: tc.name, duration: `${dur}ms`, resultLen: result.length });
			} catch (err) {
				const dur = Date.now() - toolStart;
				result = `Error: ${err instanceof Error ? err.message : String(err)}`;
				chatLog("error", round, "TOOL_EXEC_ERR", { name: tc.name, duration: `${dur}ms`, error: result.slice(0, 200) });
			}
			totalToolCalls++;

			onEvent({ type: "tool_result", toolResult: { id: tc.id, result } });

			currentMessages.push({
				role: "tool",
				content: result,
				tool_call_id: tc.id,
			});
		}

		chatLog("info", round, "ROUND_DONE", { duration: `${Date.now() - roundStart}ms`, toolsExecuted: toolCalls.size });
	}

	chatLog("warn", 0, "MAX_ROUNDS_REACHED", { rounds: MAX_TOOL_ROUNDS, totalDuration: `${Date.now() - chatStart}ms`, totalToolCalls });
	onEvent({ type: "done" });
}
