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
