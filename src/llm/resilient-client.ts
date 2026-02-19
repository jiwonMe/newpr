import type { AgentToolName } from "../workspace/types.ts";
import type { LlmClient, LlmClientOptions, LlmResponse, StreamChunkCallback } from "./client.ts";
import { createLlmClient } from "./client.ts";
import { createAgentLlmClient } from "./agent-client.ts";

interface ResilientClientOptions {
	preferredAgent?: AgentToolName;
	onFallback?: (reason: string) => void;
}

function isOpenRouter401UserNotFound(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return /OpenRouter API error\s*401/i.test(error.message) && /User not found/i.test(error.message);
}

function isOpenRouterJsonParseFailure(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return /JSON Parse error/i.test(error.message)
		|| /Unexpected token/i.test(error.message)
		|| /Unterminated string/i.test(error.message);
}

export function createResilientLlmClient(
	options: LlmClientOptions,
	resilientOptions: ResilientClientOptions = {},
): LlmClient {
	const primary = createLlmClient(options);
	let fallback: LlmClient | null = null;
	let fallbackNotified = false;

	const ensureFallback = (): LlmClient => {
		if (!fallback) {
			fallback = createAgentLlmClient(options.timeout, resilientOptions.preferredAgent);
		}
		return fallback;
	};

	const notifyFallback = (reason: string): void => {
		if (fallbackNotified) return;
		fallbackNotified = true;
		resilientOptions.onFallback?.(reason);
	};

	const tryWithFallback = async (run: (client: LlmClient) => Promise<LlmResponse>): Promise<LlmResponse> => {
		try {
			return await run(primary);
		} catch (error) {
			if (!options.api_key) {
				throw error;
			}

			if (isOpenRouter401UserNotFound(error)) {
				notifyFallback("OpenRouter authentication failed (401 User not found)");
				return run(ensureFallback());
			}

			if (isOpenRouterJsonParseFailure(error)) {
				notifyFallback("OpenRouter response parsing failed");
				return run(ensureFallback());
			}

			throw error;
		}
	};

	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			return tryWithFallback((client) => client.complete(systemPrompt, userPrompt));
		},

		async completeStream(
			systemPrompt: string,
			userPrompt: string,
			onChunk: StreamChunkCallback,
		): Promise<LlmResponse> {
			return tryWithFallback((client) => client.completeStream(systemPrompt, userPrompt, onChunk));
		},
	};
}
