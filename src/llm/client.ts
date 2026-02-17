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

export async function chatWithTools(
	options: LlmClientOptions,
	messages: OpenRouterChatMessage[],
	tools: ChatTool[],
	executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
	onEvent: ChatStreamCallback,
): Promise<void> {
	const MAX_TOOL_ROUNDS = 10;

	let currentMessages = [...messages];

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), options.timeout * 1000);

		let response: Response;
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
		} catch (err) {
			clearTimeout(timeoutId);
			onEvent({ type: "error", error: err instanceof Error ? err.message : String(err) });
			return;
		}

		clearTimeout(timeoutId);

		if (!response.ok) {
			const body = await response.text();
			onEvent({ type: "error", error: `OpenRouter API error ${response.status}: ${body}` });
			return;
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let textContent = "";
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
		} finally {
			reader.releaseLock();
		}

		if (toolCalls.size === 0) {
			onEvent({ type: "done" });
			return;
		}

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

			let result: string;
			try {
				result = await executeTool(tc.name, args);
			} catch (err) {
				result = `Error: ${err instanceof Error ? err.message : String(err)}`;
			}

			onEvent({ type: "tool_result", toolResult: { id: tc.id, result } });

			currentMessages.push({
				role: "tool",
				content: result,
				tool_call_id: tc.id,
			});
		}
	}

	onEvent({ type: "done" });
}
