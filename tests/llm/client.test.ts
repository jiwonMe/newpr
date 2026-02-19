import { test, expect, describe, afterEach } from "bun:test";
import { createLlmClient } from "../../src/llm/client.ts";

const MOCK_RESPONSE = {
	choices: [{ message: { content: '{"test": true}' } }],
	model: "test-model",
	usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

const originalFetch = globalThis.fetch;
const originalRequire = (globalThis as any).require;

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
	(globalThis as Record<string, unknown>).fetch = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => handler(url as string, init!);
}

function restoreFetch() {
	(globalThis as Record<string, unknown>).fetch = originalFetch;
}

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

function sseLines(deltas: string[], model = "test-model"): string[] {
	const lines: string[] = [];
	for (const delta of deltas) {
		lines.push(
			`data: ${JSON.stringify({ choices: [{ delta: { content: delta }, finish_reason: null }], model })}\n\n`,
		);
	}
	lines.push(
		`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model, usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 } })}\n\n`,
	);
	lines.push("data: [DONE]\n\n");
	return lines;
}

describe("createLlmClient", () => {
	afterEach(restoreFetch);

	test("sends correct request to OpenRouter", async () => {
		let capturedBody: Record<string, unknown> = {};
		let capturedHeaders: Record<string, string> = {};

		mockFetch((_url, init) => {
			capturedBody = JSON.parse(init.body as string);
			capturedHeaders = Object.fromEntries(
				Object.entries(init.headers as Record<string, string>),
			);
			return new Response(JSON.stringify(MOCK_RESPONSE));
		});

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.complete("system", "user");

		expect(capturedHeaders.Authorization).toBe("Bearer sk-test");
		expect(capturedBody.model).toBe("test/model");
		expect((capturedBody.messages as Array<{ role: string }>)[0]!.role).toBe("system");
		expect(result.content).toBe('{"test": true}');
		expect(result.model).toBe("test-model");
		expect(result.usage.total_tokens).toBe(30);
	});

	test("throws on non-retriable API errors (e.g. 400)", async () => {
		mockFetch(() => new Response("Bad Request", { status: 400 }));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		await expect(client.complete("s", "u")).rejects.toThrow("OpenRouter API error 400");
	});

	test("retries on 500 server errors", async () => {
		let attempts = 0;
		mockFetch(() => {
			attempts++;
			if (attempts < 3) {
				return new Response("Internal Server Error", { status: 500 });
			}
			return new Response(JSON.stringify(MOCK_RESPONSE));
		});

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.complete("s", "u");
		expect(result.content).toBe('{"test": true}');
		expect(attempts).toBe(3);
	}, 30_000);

	test("throws on empty response", async () => {
		const emptyResponse = { choices: [{ message: { content: "" } }], model: "m" };
		mockFetch(() => new Response(JSON.stringify(emptyResponse)));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		await expect(client.complete("s", "u")).rejects.toThrow("empty response");
	});

	test("returns defaults for missing usage", async () => {
		const noUsage = { choices: [{ message: { content: "ok" } }], model: "m" };
		mockFetch(() => new Response(JSON.stringify(noUsage)));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.complete("s", "u");

		expect(result.usage.prompt_tokens).toBe(0);
		expect(result.usage.completion_tokens).toBe(0);
	});

	// fallback behaviour when there is no API key
	describe("fallbacks without api_key", () => {
		afterEach(() => {
			// restore original require after each sub-test
			(globalThis as any).require = originalRequire;
		});

		test("uses Claude Code when available", async () => {
			const orig = originalRequire;
			(globalThis as any).require = (path: string) => {
				if (path.endsWith("claude-code-client.ts")) {
					return {
						createClaudeCodeClient: (timeout: number) => ({
							async complete() {
								return {
									content: "claude result",
									model: "claude-code",
									usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
								};
							},
							async completeStream(_s, _u, onChunk) {
								onChunk("claude result", "claude result");
								return {
									content: "claude result",
									model: "claude-code",
									usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
								};
							},
						}),
					};
				}
				return orig(path);
			};

			const client = createLlmClient({ api_key: "", model: "x", timeout: 5 });
			const r = await client.complete("a", "b");
			expect(r.content).toBe("claude result");
		});

		test("falls back to Codex when Claude missing", async () => {
			const orig = originalRequire;
			(globalThis as any).require = (path: string) => {
				if (path.endsWith("claude-code-client.ts")) {
					throw new Error("not found");
				}
				if (path.endsWith("codex-client.ts")) {
					return {
						createCodexClient: (timeout: number) => ({
							async complete() {
								return {
									content: "codex result",
									model: "codex",
									usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
								};
							},
							async completeStream(_s, _u, onChunk) {
								onChunk("codex result", "codex result");
								return {
									content: "codex result",
									model: "codex",
									usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
								};
							},
						}),
					};
				}
				return orig(path);
			};

			const client = createLlmClient({ api_key: "", model: "x", timeout: 5 });
			const r = await client.complete("a", "b");
			expect(r.content).toBe("codex result");
		});

		test("throws when no backend is available", () => {
			(globalThis as any).require = () => {
				throw new Error("nope");
			};
			expect(() => createLlmClient({ api_key: "", model: "m", timeout: 1 })).toThrow(
				"No LLM backend available",
			);
		});
	});
});

describe("completeStream", () => {
	afterEach(restoreFetch);

	test("streams chunks and returns accumulated content", async () => {
		const sseData = sseLines(["Hello", " ", "world"]);
		mockFetch(() => new Response(createSSEStream(sseData), {
			headers: { "Content-Type": "text/event-stream" },
		}));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const chunks: string[] = [];
		const accumulatedSnapshots: string[] = [];

		const result = await client.completeStream("system", "user", (chunk, accumulated) => {
			chunks.push(chunk);
			accumulatedSnapshots.push(accumulated);
		});

		expect(result.content).toBe("Hello world");
		expect(result.model).toBe("test-model");
		expect(result.usage.total_tokens).toBe(15);
		expect(chunks).toEqual(["Hello", " ", "world"]);
		expect(accumulatedSnapshots).toEqual(["Hello", "Hello ", "Hello world"]);
	});

	test("sends stream: true in request body", async () => {
		let capturedBody: Record<string, unknown> = {};
		const sseData = sseLines(["ok"]);

		mockFetch((_url, init) => {
			capturedBody = JSON.parse(init.body as string);
			return new Response(createSSEStream(sseData), {
				headers: { "Content-Type": "text/event-stream" },
			});
		});

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		await client.completeStream("s", "u", () => {});

		expect(capturedBody.stream).toBe(true);
	});

	test("throws on empty streaming response", async () => {
		const sseData = ["data: [DONE]\n\n"];
		mockFetch(() => new Response(createSSEStream(sseData), {
			headers: { "Content-Type": "text/event-stream" },
		}));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		await expect(client.completeStream("s", "u", () => {})).rejects.toThrow("empty streaming response");
	});

	test("retries on 429 before streaming starts", async () => {
		let attempts = 0;
		const sseData = sseLines(["ok"]);

		mockFetch(() => {
			attempts++;
			if (attempts < 2) {
				return new Response("Rate limited", { status: 429 });
			}
			return new Response(createSSEStream(sseData), {
				headers: { "Content-Type": "text/event-stream" },
			});
		});

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.completeStream("s", "u", () => {});
		expect(result.content).toBe("ok");
		expect(attempts).toBe(2);
	}, 30_000);

	test("handles chunked SSE data split across reads", async () => {
		const encoder = new TextEncoder();
		const line1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" }, finish_reason: null }], model: "m" })}\n\n`;
		const line2 = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`;

		const splitPoint = Math.floor(line1.length / 2);
		const part1 = line1.slice(0, splitPoint);
		const part2 = line1.slice(splitPoint) + line2;

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(part1));
				controller.enqueue(encoder.encode(part2));
				controller.close();
			},
		});

		mockFetch(() => new Response(stream, {
			headers: { "Content-Type": "text/event-stream" },
		}));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.completeStream("s", "u", () => {});
		expect(result.content).toBe("Hi");
	});

	test("skips malformed SSE chunks gracefully", async () => {
		const sseData = [
			`data: ${JSON.stringify({ choices: [{ delta: { content: "A" }, finish_reason: null }], model: "m" })}\n\n`,
			"data: {invalid json}\n\n",
			`data: ${JSON.stringify({ choices: [{ delta: { content: "B" }, finish_reason: null }], model: "m" })}\n\n`,
			`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model: "m", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } })}\n\ndata: [DONE]\n\n`,
		];

		mockFetch(() => new Response(createSSEStream(sseData), {
			headers: { "Content-Type": "text/event-stream" },
		}));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		const result = await client.completeStream("s", "u", () => {});
		expect(result.content).toBe("AB");
	});
});
