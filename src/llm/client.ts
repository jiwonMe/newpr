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

export interface LlmClient {
	complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse>;
}

interface OpenRouterResponse {
	choices: Array<{ message: { content: string } }>;
	model: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

class NonRetriableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NonRetriableError";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			let lastError: Error | null = null;

			for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
				if (attempt > 0) {
					const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
					await sleep(delay);
				}

				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), options.timeout * 1000);

				try {
					const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
							messages: [
								{ role: "system", content: systemPrompt },
								{ role: "user", content: userPrompt },
							],
							temperature: 0.1,
						}),
					});

					clearTimeout(timeoutId);

					if (response.status === 429) {
						lastError = new Error(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
						continue;
					}

					if (!response.ok) {
						const body = await response.text();
						throw new NonRetriableError(`OpenRouter API error ${response.status}: ${body}`);
					}

					const data = (await response.json()) as OpenRouterResponse;
					const content = data.choices[0]?.message?.content;
					if (!content) {
						throw new NonRetriableError("OpenRouter returned empty response");
					}

					return {
						content,
						model: data.model,
						usage: {
							prompt_tokens: data.usage?.prompt_tokens ?? 0,
							completion_tokens: data.usage?.completion_tokens ?? 0,
							total_tokens: data.usage?.total_tokens ?? 0,
						},
					};
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
		},
	};
}
