import { test, expect, describe, afterEach } from "bun:test";
import { analyzePr } from "../../src/analyzer/pipeline.ts";
import type { NewprConfig } from "../../src/types/config.ts";
import type { ProgressEvent } from "../../src/analyzer/progress.ts";

const originalFetch = globalThis.fetch;

function restoreFetch() {
	(globalThis as Record<string, unknown>).fetch = originalFetch;
}

const MOCK_PR_JSON = {
	number: 42,
	title: "Test PR",
	html_url: "https://github.com/o/r/pull/42",
	user: { login: "dev" },
	base: { ref: "main" },
	head: { ref: "feature" },
	additions: 10,
	deletions: 5,
	changed_files: 2,
};

const MOCK_COMMITS = [
	{ sha: "abc12345", commit: { message: "Add variable y", author: { name: "dev", date: "2025-01-01T00:00:00Z" } }, files: [{ filename: "src/a.ts" }] },
	{ sha: "def67890", commit: { message: "Add utility function b", author: { name: "dev", date: "2025-01-01T01:00:00Z" } }, files: [{ filename: "src/b.ts" }] },
];

const MOCK_DIFF = `diff --git a/src/a.ts b/src/a.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 export { x };
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
index 000..abc
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,2 @@
+export function b() {}
+export default b;`;

const MOCK_FILE_SUMMARIES = JSON.stringify([
	{ path: "src/a.ts", summary: "Added variable y" },
	{ path: "src/b.ts", summary: "New utility function b" },
]);

const MOCK_GROUPS = JSON.stringify([
	{ name: "Feature Addition", type: "feature", description: "Added new functionality", files: ["src/a.ts", "src/b.ts"] },
]);

const MOCK_SUMMARY = JSON.stringify({
	purpose: "Add new feature",
	scope: "Utility modules",
	impact: "Low",
	risk_level: "low",
});

const MOCK_NARRATIVE = "This PR adds a new utility function and updates exports.";

let fetchCallCount = 0;

function createSSEResponse(content: string): Response {
	const encoder = new TextEncoder();
	const lines = [
		`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }], model: "test-model" })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model: "test-model", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`,
		"data: [DONE]\n\n",
	];
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

function setupMockFetch() {
	fetchCallCount = 0;
	(globalThis as Record<string, unknown>).fetch = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		fetchCallCount++;
		const urlStr = url as string;
		const accept = (init?.headers as Record<string, string>)?.Accept ?? "";

		if (urlStr.includes("/pulls/") && urlStr.includes("/commits")) {
			return new Response(JSON.stringify(MOCK_COMMITS), { status: 200 });
		}

		if (urlStr.includes("/pulls/") && accept.includes("diff")) {
			return new Response(MOCK_DIFF, { status: 200 });
		}

		if (urlStr.includes("/pulls/")) {
			return new Response(JSON.stringify(MOCK_PR_JSON), { status: 200 });
		}

		if (urlStr.includes("openrouter.ai")) {
			const body = JSON.parse(init?.body as string);
			const systemPrompt = body.messages[0].content as string;
			const isStream = body.stream === true;

			let content: string;
			if (systemPrompt.includes("1-line summary")) {
				content = MOCK_FILE_SUMMARIES;
			} else if (systemPrompt.includes("Group the following")) {
				content = MOCK_GROUPS;
			} else if (systemPrompt.includes("overall summary") || systemPrompt.includes("risk_level")) {
				content = MOCK_SUMMARY;
			} else {
				content = MOCK_NARRATIVE;
			}

			if (isStream) {
				return createSSEResponse(content);
			}

			return new Response(
				JSON.stringify({
					choices: [{ message: { content } }],
					model: "test-model",
					usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
				}),
				{ status: 200 },
			);
		}

		return new Response("Not found", { status: 404 });
	};
}

const TEST_CONFIG: NewprConfig = {
	openrouter_api_key: "sk-test",
	model: "test/model",
	max_files: 100,
	timeout: 30,
	concurrency: 5,
	language: "English",
};

describe("analyzePr", () => {
	afterEach(restoreFetch);

	test("produces complete output with all sections", async () => {
		setupMockFetch();

		const result = await analyzePr({
			pr: { owner: "o", repo: "r", number: 42 },
			token: "tok",
			config: TEST_CONFIG,
		});

		expect(result.meta.pr_number).toBe(42);
		expect(result.meta.pr_title).toBe("Test PR");
		expect(result.meta.model_used).toBe("test/model");
		expect(result.summary.purpose).toBe("Add new feature");
		expect(result.summary.risk_level).toBe("low");
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]!.name).toBe("Feature Addition");
		expect(result.files).toHaveLength(2);
		expect(result.narrative).toBe(MOCK_NARRATIVE);
	});

	test("reports progress events", async () => {
		setupMockFetch();

		const events: ProgressEvent[] = [];
		await analyzePr({
			pr: { owner: "o", repo: "r", number: 42 },
			token: "tok",
			config: TEST_CONFIG,
			onProgress: (e) => events.push(e),
		});

		const stages = events.map((e) => e.stage);
		expect(stages).toContain("fetching");
		expect(stages).toContain("parsing");
		expect(stages).toContain("analyzing");
		expect(stages).toContain("grouping");
		expect(stages).toContain("summarizing");
		expect(stages).toContain("narrating");
		expect(stages).toContain("done");
	});

	test("assigns files to groups", async () => {
		setupMockFetch();

		const result = await analyzePr({
			pr: { owner: "o", repo: "r", number: 42 },
			token: "tok",
			config: TEST_CONFIG,
		});

		expect(result.files[0]!.groups).toContain("Feature Addition");
		expect(result.files[1]!.groups).toContain("Feature Addition");
	});
});
