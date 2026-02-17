import { test, expect, describe, afterEach } from "bun:test";
import { createLlmClient } from "../../src/llm/client.ts";

const MOCK_RESPONSE = {
	choices: [{ message: { content: '{"test": true}' } }],
	model: "test-model",
	usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
	(globalThis as Record<string, unknown>).fetch = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => handler(url as string, init!);
}

function restoreFetch() {
	(globalThis as Record<string, unknown>).fetch = originalFetch;
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

	test("throws on non-429 API errors", async () => {
		mockFetch(() => new Response("Internal Server Error", { status: 500 }));

		const client = createLlmClient({ api_key: "sk-test", model: "test/model", timeout: 30 });
		await expect(client.complete("s", "u")).rejects.toThrow("OpenRouter API error 500");
	});

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
});
