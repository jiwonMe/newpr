import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../../src/config/index.ts";

const emptyStore = async () => ({});

describe("loadConfig", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.NEWPR_MODEL;
		delete process.env.NEWPR_MAX_FILES;
		delete process.env.NEWPR_TIMEOUT;
		delete process.env.NEWPR_CONCURRENCY;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test("throws when OPENROUTER_API_KEY is missing", async () => {
		await expect(loadConfig(undefined, emptyStore)).rejects.toThrow("OPENROUTER_API_KEY");
	});

	test("returns defaults when only API key is set", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-test-key";

		const config = await loadConfig(undefined, emptyStore);

		expect(config.openrouter_api_key).toBe("sk-or-test-key");
		expect(config.model).toBe("anthropic/claude-sonnet-4.5");
		expect(config.max_files).toBe(100);
		expect(config.timeout).toBe(120);
		expect(config.concurrency).toBe(5);
	});

	test("env vars override defaults", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-test-key";
		process.env.NEWPR_MODEL = "openai/gpt-4o";
		process.env.NEWPR_MAX_FILES = "50";
		process.env.NEWPR_TIMEOUT = "60";
		process.env.NEWPR_CONCURRENCY = "10";

		const config = await loadConfig(undefined, emptyStore);

		expect(config.model).toBe("openai/gpt-4o");
		expect(config.max_files).toBe(50);
		expect(config.timeout).toBe(60);
		expect(config.concurrency).toBe(10);
	});

	test("CLI overrides take highest priority", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-test-key";
		process.env.NEWPR_MODEL = "openai/gpt-4o";

		const config = await loadConfig({ model: "anthropic/claude-opus-4" }, emptyStore);

		expect(config.model).toBe("anthropic/claude-opus-4");
	});

	test("ignores invalid numeric env vars, uses defaults", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-test-key";
		process.env.NEWPR_MAX_FILES = "not-a-number";
		process.env.NEWPR_TIMEOUT = "";

		const config = await loadConfig(undefined, emptyStore);

		expect(config.max_files).toBe(100);
		expect(config.timeout).toBe(120);
	});

	test("reads api key from stored config when env is empty", async () => {
		const storeWithKey = async () => ({ openrouter_api_key: "sk-or-from-file" });

		const config = await loadConfig(undefined, storeWithKey);

		expect(config.openrouter_api_key).toBe("sk-or-from-file");
	});

	test("env var takes priority over stored config", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-from-env";
		const storeWithKey = async () => ({ openrouter_api_key: "sk-or-from-file" });

		const config = await loadConfig(undefined, storeWithKey);

		expect(config.openrouter_api_key).toBe("sk-or-from-env");
	});
});
