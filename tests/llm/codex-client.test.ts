import { afterEach, describe, expect, test } from "bun:test";
import { createCodexClient } from "../../src/llm/codex-client.ts";

const originalSpawn = Bun.spawn;
const originalDollar = Bun.$;

function restoreBun() {
	(Bun as any).spawn = originalSpawn;
	(Bun as any).$ = originalDollar;
}

function createStdout(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(`${line}\n`));
			}
			controller.close();
		},
	});
}

function mockCodexPath(path = "/usr/local/bin/codex") {
	(Bun as any).$ = () => ({
		text: async () => `${path}\n`,
	});
}

function mockSpawn(lines: string[], exitCode: number) {
	(Bun as any).spawn = () => ({
		stdout: createStdout(lines),
		exited: Promise.resolve(exitCode),
		kill() {},
	});
}

describe("createCodexClient", () => {
	afterEach(restoreBun);

	test("throws when codex exits with non-zero status", async () => {
		mockCodexPath();
		mockSpawn([
			JSON.stringify({
				type: "item.completed",
				item: { type: "agent_message", text: "answer" },
			}),
		], 2);

		const client = createCodexClient(5);
		await expect(client.complete("system", "user")).rejects.toThrow("Codex exited with code 2");
	});

	test("throws when codex returns empty response", async () => {
		mockCodexPath();
		mockSpawn([
			JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "" } }),
		], 0);

		const client = createCodexClient(5);
		await expect(client.complete("system", "user")).rejects.toThrow("Codex returned empty response");
	});
});
