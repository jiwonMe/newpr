import { test, expect, describe } from "bun:test";

describe("fetchPrDiff", () => {
	test("constructs correct URL and headers", async () => {
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		const originalFetch = globalThis.fetch;

		(globalThis as Record<string, unknown>).fetch = async (url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = url as string;
			capturedHeaders = Object.fromEntries(
				Object.entries((init?.headers as Record<string, string>) ?? {}),
			);
			return new Response("diff content here", { status: 200 });
		};

		const { fetchPrDiff } = await import("../../src/github/fetch-diff.ts");
		const result = await fetchPrDiff({ owner: "o", repo: "r", number: 5 }, "tok123");

		expect(capturedUrl).toBe("https://api.github.com/repos/o/r/pulls/5");
		expect(capturedHeaders.Accept).toBe("application/vnd.github.v3.diff");
		expect(capturedHeaders.Authorization).toBe("token tok123");
		expect(result).toBe("diff content here");

		(globalThis as Record<string, unknown>).fetch = originalFetch;
	});
});
