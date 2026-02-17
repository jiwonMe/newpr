import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const TEST_DIR = join(import.meta.dir, ".test-config");
const TEST_FILE = join(TEST_DIR, "config.json");

describe("config store", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
	});

	test("reads empty config when file does not exist", async () => {
		const { readStoredConfig } = await mockStore();
		const config = await readStoredConfig();
		expect(config).toEqual({});
	});

	test("writes and reads config", async () => {
		const { readStoredConfig, writeStoredConfig } = await mockStore();
		await writeStoredConfig({ openrouter_api_key: "sk-or-test" });
		const config = await readStoredConfig();
		expect(config.openrouter_api_key).toBe("sk-or-test");
	});

	test("merges new values with existing config", async () => {
		const { readStoredConfig, writeStoredConfig } = await mockStore();
		await writeStoredConfig({ openrouter_api_key: "sk-or-test", model: "gpt-4o" });
		await writeStoredConfig({ model: "claude-sonnet" });
		const config = await readStoredConfig();
		expect(config.openrouter_api_key).toBe("sk-or-test");
		expect(config.model).toBe("claude-sonnet");
	});

	test("deletes a specific key", async () => {
		const { readStoredConfig, writeStoredConfig, deleteStoredKey } = await mockStore();
		await writeStoredConfig({ openrouter_api_key: "sk-or-test", model: "gpt-4o" });
		await deleteStoredKey("openrouter_api_key");
		const config = await readStoredConfig();
		expect(config.openrouter_api_key).toBeUndefined();
		expect(config.model).toBe("gpt-4o");
	});
});

async function mockStore() {
	const configFile = TEST_FILE;
	const configDir = TEST_DIR;

	type StoredConfig = {
		openrouter_api_key?: string;
		model?: string;
		max_files?: number;
		timeout?: number;
		concurrency?: number;
	};

	async function readStoredConfig(): Promise<StoredConfig> {
		try {
			const file = Bun.file(configFile);
			const exists = await file.exists();
			if (!exists) return {};
			const text = await file.text();
			return JSON.parse(text) as StoredConfig;
		} catch {
			return {};
		}
	}

	async function writeStoredConfig(update: StoredConfig): Promise<void> {
		mkdirSync(configDir, { recursive: true });
		const existing = await readStoredConfig();
		const merged = { ...existing, ...update };
		await Bun.write(configFile, `${JSON.stringify(merged, null, 2)}\n`);
	}

	async function deleteStoredKey(key: keyof StoredConfig): Promise<void> {
		const existing = await readStoredConfig();
		delete existing[key];
		mkdirSync(configDir, { recursive: true });
		await Bun.write(configFile, `${JSON.stringify(existing, null, 2)}\n`);
	}

	return { readStoredConfig, writeStoredConfig, deleteStoredKey };
}
