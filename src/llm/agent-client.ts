import type { AgentToolName } from "../workspace/types.ts";
import { getAvailableAgents, runAgentWithFallback } from "../workspace/agent.ts";
import type { LlmClient, LlmResponse, StreamChunkCallback } from "./client.ts";

function buildPrompt(systemPrompt: string, userPrompt: string): string {
	return `<system>\n${systemPrompt}\n</system>\n\n${userPrompt}`;
}

export function createAgentLlmClient(timeoutSeconds: number, preferredAgent?: AgentToolName): LlmClient {
	let agentsPromise: Promise<Awaited<ReturnType<typeof getAvailableAgents>>> | null = null;

	const ensureAgents = async () => {
		if (!agentsPromise) {
			agentsPromise = getAvailableAgents(preferredAgent);
		}
		return agentsPromise;
	};

	const runComplete = async (systemPrompt: string, userPrompt: string): Promise<LlmResponse> => {
		const agents = await ensureAgents();
		const prompt = buildPrompt(systemPrompt, userPrompt);
		const result = await runAgentWithFallback(agents, process.cwd(), prompt, {
			timeout: timeoutSeconds * 1000,
		});

		const content = result.answer.trim();
		if (!content) {
			throw new Error("Agent returned empty response");
		}

		return {
			content,
			model: `agent:${result.tool_used}`,
			usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
		};
	};

	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			return runComplete(systemPrompt, userPrompt);
		},

		async completeStream(
			systemPrompt: string,
			userPrompt: string,
			onChunk: StreamChunkCallback,
		): Promise<LlmResponse> {
			const response = await runComplete(systemPrompt, userPrompt);
			onChunk(response.content, response.content);
			return response;
		},
	};
}
