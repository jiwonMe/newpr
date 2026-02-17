import { readStoredConfig, writeStoredConfig, getConfigPath, deleteStoredKey } from "../config/store.ts";

async function promptForKey(): Promise<string> {
	process.stdout.write("Enter your OpenRouter API key: ");
	const reader = Bun.stdin.stream().getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	const input = value ? new TextDecoder().decode(value).trim() : "";
	if (!input) {
		throw new Error("No API key provided.");
	}
	return input;
}

function maskKey(key: string): string {
	if (key.length <= 8) return "****";
	return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export async function handleAuth(subArgs: string[]): Promise<void> {
	const subcommand = subArgs[0];

	if (subcommand === "status") {
		return showStatus();
	}

	if (subcommand === "logout") {
		await deleteStoredKey("openrouter_api_key");
		console.log("OpenRouter API key removed from config.");
		return;
	}

	const keyFlagIdx = subArgs.indexOf("--key");
	let key: string;

	if (keyFlagIdx !== -1) {
		const keyValue = subArgs[keyFlagIdx + 1];
		if (!keyValue) {
			console.error("Error: --key requires a value. Usage: newpr auth --key sk-or-...");
			process.exit(1);
		}
		key = keyValue;
	} else {
		key = await promptForKey();
	}

	if (!key.startsWith("sk-or-")) {
		console.error("Warning: Key doesn't start with 'sk-or-'. Are you sure this is an OpenRouter key?");
	}

	await writeStoredConfig({ openrouter_api_key: key });
	console.log(`API key saved to ${getConfigPath()}`);
	console.log(`Key: ${maskKey(key)}`);
}

async function showStatus(): Promise<void> {
	const envKey = process.env.OPENROUTER_API_KEY;
	const stored = await readStoredConfig();

	console.log("Authentication Status:");
	console.log("─".repeat(40));

	if (envKey) {
		console.log(`  env OPENROUTER_API_KEY: ${maskKey(envKey)} (active)`);
	} else {
		console.log("  env OPENROUTER_API_KEY: not set");
	}

	if (stored.openrouter_api_key) {
		const isActive = !envKey;
		console.log(`  config file:           ${maskKey(stored.openrouter_api_key)}${isActive ? " (active)" : " (overridden by env)"}`);
	} else {
		console.log("  config file:           not set");
	}

	console.log("");
	console.log(`Config path: ${getConfigPath()}`);

	if (!envKey && !stored.openrouter_api_key) {
		console.log("\nNo API key configured. Run `newpr auth` to set one.");
	}
}
