import type { LlmClient, LlmResponse, StreamChunkCallback } from "./client.ts";

async function findClaude(): Promise<string | null> {
	try {
		const result = await Bun.$`which claude`.text();
		return result.trim() || null;
	} catch {
		return null;
	}
}

let claudePath: string | null | undefined;

async function getClaude(): Promise<string> {
	if (claudePath === undefined) {
		claudePath = await findClaude();
	}
	if (!claudePath) {
		throw new Error(
			"Claude Code is not installed.\n\n" +
			"To use newpr without an OpenRouter API key, install Claude Code:\n" +
			"  npm install -g @anthropic-ai/claude-code\n\n" +
			"Or set OPENROUTER_API_KEY in your environment.",
		);
	}
	return claudePath;
}

function buildPrompt(systemPrompt: string, userPrompt: string): string {
	return `<system>\n${systemPrompt}\n</system>\n\n${userPrompt}`;
}

export function createClaudeCodeClient(timeout: number): LlmClient {
	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			const bin = await getClaude();
			const prompt = buildPrompt(systemPrompt, userPrompt);

			const proc = Bun.spawn(
				[bin, "-p", "--output-format", "text", prompt],
				{ cwd: process.cwd(), stdin: "ignore", stdout: "pipe", stderr: "ignore" },
			);

			const timeoutId = setTimeout(() => proc.kill(), timeout * 1000);
			const content = await new Response(proc.stdout).text();
			clearTimeout(timeoutId);

			const exitCode = await proc.exited;
			if (exitCode !== 0 || !content.trim()) {
				throw new Error(`Claude Code exited with code ${exitCode}`);
			}

			return {
				content: content.trim(),
				model: "claude-code",
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
			};
		},

		async completeStream(
			systemPrompt: string,
			userPrompt: string,
			onChunk: StreamChunkCallback,
		): Promise<LlmResponse> {
			const bin = await getClaude();
			const prompt = buildPrompt(systemPrompt, userPrompt);

			const proc = Bun.spawn(
				[bin, "-p", "--output-format", "stream-json", prompt],
				{ cwd: process.cwd(), stdin: "ignore", stdout: "pipe", stderr: "ignore" },
			);

			let accumulated = "";
			let resultText = "";
			const reader = proc.stdout!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			const timeoutId = setTimeout(() => proc.kill(), timeout * 1000);

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const raw of lines) {
						const line = raw.trim();
						if (!line) continue;
						try {
							const event = JSON.parse(line);
							if (event.type === "assistant" && event.message?.content) {
								for (const block of event.message.content) {
									if (block.type === "text" && block.text) {
										accumulated += block.text;
										onChunk(block.text, accumulated);
									}
								}
							} else if (event.type === "result") {
								resultText = event.result ?? accumulated;
							} else if (event.type === "content_block_delta") {
								const delta = event.delta?.text ?? "";
								if (delta) {
									accumulated += delta;
									onChunk(delta, accumulated);
								}
							}
						} catch {}
					}
				}
			} finally {
				reader.releaseLock();
				clearTimeout(timeoutId);
			}

			const content = resultText || accumulated;
			if (!content.trim()) {
				throw new Error("Claude Code returned empty response");
			}

			return {
				content: content.trim(),
				model: "claude-code",
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
			};
		},
	};
}

export async function isClaudeCodeAvailable(): Promise<boolean> {
	return (await findClaude()) !== null;
}
