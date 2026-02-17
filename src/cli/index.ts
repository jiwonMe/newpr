#!/usr/bin/env bun
import { parseArgs } from "./args.ts";
import { handleAuth } from "./auth.ts";
import { formatPretty } from "./pretty.ts";
import { loadConfig } from "../config/index.ts";
import { getGithubToken } from "../github/auth.ts";
import { parsePrInput } from "../github/parse-pr.ts";
import { analyzePr } from "../analyzer/pipeline.ts";
import { createStderrProgress, createSilentProgress } from "../analyzer/progress.ts";

const VERSION = "0.1.0";

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	if (args.command === "help") return;

	if (args.command === "version") {
		console.log(`newpr v${VERSION}`);
		return;
	}

	if (args.command === "auth") {
		try {
			await handleAuth(args.subArgs);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`Error: ${message}\n`);
			process.exit(1);
		}
		return;
	}

	try {
		const config = await loadConfig({ model: args.model });
		const token = await getGithubToken();
		const pr = parsePrInput(args.prInput!, args.repo);
		const progress = args.verbose ? createStderrProgress() : createSilentProgress();

		const result = await analyzePr({ pr, token, config, onProgress: progress });

		if (args.output === "pretty") {
			console.log(formatPretty(result));
		} else {
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Error: ${message}\n`);
		process.exit(1);
	}
}

main();
