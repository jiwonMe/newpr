import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const CONFIG_DIR = join(homedir(), ".newpr");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface StoredConfig {
	openrouter_api_key?: string;
	model?: string;
	max_files?: number;
	timeout?: number;
	concurrency?: number;
	language?: string;
	agent?: string;
	enabled_plugins?: string[];
}

function ensureDir(): void {
	mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getConfigPath(): string {
	return CONFIG_FILE;
}

export async function readStoredConfig(): Promise<StoredConfig> {
	try {
		const file = Bun.file(CONFIG_FILE);
		const exists = await file.exists();
		if (!exists) return {};
		const text = await file.text();
		return JSON.parse(text) as StoredConfig;
	} catch {
		return {};
	}
}

export async function writeStoredConfig(update: StoredConfig): Promise<void> {
	ensureDir();
	const existing = await readStoredConfig();
	const merged = { ...existing, ...update };
	await Bun.write(CONFIG_FILE, `${JSON.stringify(merged, null, 2)}\n`);
}

export async function deleteStoredKey(key: keyof StoredConfig): Promise<void> {
	const existing = await readStoredConfig();
	delete existing[key];
	ensureDir();
	await Bun.write(CONFIG_FILE, `${JSON.stringify(existing, null, 2)}\n`);
}
