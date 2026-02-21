import type { LlmClient, LlmResponse, StreamChunkCallback } from "./client.ts";

async function findCodex(): Promise<string | null> {
	try {
		const result = await Bun.$`which codex`.text();
		return result.trim() || null;
	} catch {
		return null;
	}
}

let codexPath: string | null | undefined;

async function getCodex(): Promise<string> {
	if (codexPath === undefined) {
		codexPath = await findCodex();
	}
	if (!codexPath) {
		throw new Error(
			"Codex CLI is not installed.\n\n" +
			"To use newpr without an OpenRouter API key, install Codex:\n" +
			"  npm install -g @openai/codex\n\n" +
			"Or set OPENROUTER_API_KEY in your environment.",
		);
	}
	return codexPath;
}

// we need a lightweight line streamer in this module as well
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
			const line = raw.trim();
			if (line) onLine(line);
		}
	}
}

export function createCodexClient(timeout: number): LlmClient {
	return {
		async complete(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
			const bin = await getCodex();
			const prompt = `${systemPrompt}\n\n${userPrompt}`;

			const proc = Bun.spawn(
				[bin, "exec", "--json", "--dangerously-bypass-approvals-and-sandbox", prompt],
				{ cwd: process.cwd(), stdin: "ignore", stdout: "pipe", stderr: "ignore" },
			);

			let answer = "";
			const stdoutPromise = proc.stdout
				? streamLines(proc.stdout, (line) => {
					try {
						const event = JSON.parse(line);
						if (
							event.type === "item.completed" &&
							event.item &&
							event.item.type === "agent_message" &&
							event.item.text
						) {
							answer = event.item.text;
						}
					} catch {}
				})
				: Promise.resolve();

			const timeoutId = setTimeout(() => proc.kill(), timeout * 1000);
			await stdoutPromise;
			clearTimeout(timeoutId);

			return {
				content: answer,
				model: "codex",
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
			};
		},

		async completeStream(
			systemPrompt: string,
			userPrompt: string,
			onChunk: StreamChunkCallback,
		): Promise<LlmResponse> {
			// streaming is not ideal for the codex fallback – just call complete and
			// emit a single chunk so callers still work.
			const resp = await this.complete(systemPrompt, userPrompt);
			onChunk(resp.content, resp.content);
			return resp;
		},
	};
}

export async function isCodexAvailable(): Promise<boolean> {
	return (await findCodex()) !== null;
}
