#!/usr/bin/env bun
import { parseArgs } from "./args.ts";
import { handleAuth } from "./auth.ts";
import { handleHistory } from "./history-cmd.ts";
import { formatPretty } from "./pretty.ts";
import { loadConfig } from "../config/index.ts";
import { getGithubToken } from "../github/auth.ts";
import { parsePrInput } from "../github/parse-pr.ts";
import { analyzePr } from "../analyzer/pipeline.ts";
import { createStderrProgress, createSilentProgress, createStreamJsonProgress } from "../analyzer/progress.ts";
import { renderLoading, renderShell } from "../tui/render.tsx";
import { checkForUpdate, printUpdateNotice } from "./update-check.ts";
import { runPreflight, printPreflight } from "./preflight.ts";
import { getVersion } from "../version.ts";

const VERSION = getVersion();

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	const updatePromise = (args.command === "shell" || args.command === "web")
		? checkForUpdate(VERSION).catch(() => null)
		: null;

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

	if (args.command === "history") {
		try {
			await handleHistory(args.subArgs);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`Error: ${message}\n`);
			process.exit(1);
		}
		return;
	}

	if (args.command === "web") {
		try {
			const preflight = await runPreflight();
			printPreflight(preflight);
			const config = await loadConfig({ model: args.model });
			const token = await getGithubToken();
			const updateInfo = await updatePromise;
			if (updateInfo) printUpdateNotice(updateInfo);
			const { startWebServer } = await import("../web/server.ts");
			await startWebServer({ port: args.port ?? 3456, token, config, cartoon: args.cartoon, preflight });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`Error: ${message}\n`);
			process.exit(1);
		}
		return;
	}

	if (args.command === "shell") {
		try {
			const preflight = await runPreflight();
			printPreflight(preflight);
			const config = await loadConfig({ model: args.model });
			const token = await getGithubToken();
			const updateInfo = await updatePromise;
			if (updateInfo) printUpdateNotice(updateInfo);
			renderShell(token, config, args.prInput);
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
		const pipelineOpts = {
			pr,
			token,
			config,
			noClone: args.noClone,
			preferredAgent: args.agent ?? config.agent,
		};

		if (args.output === "tui") {
			const loading = await renderLoading();
			const result = await analyzePr({
				...pipelineOpts,
				onProgress: (event) => loading.update(event),
			});
			loading.finish(result);
		} else if (args.output === "stream-json") {
			const progress = createStreamJsonProgress();
			const result = await analyzePr({ ...pipelineOpts, onProgress: progress });
			const resultLine = JSON.stringify({ type: "result", data: result });
			process.stdout.write(`${resultLine}\n`);
		} else {
			const progress = args.verbose ? createStderrProgress() : createSilentProgress();
			const result = await analyzePr({ ...pipelineOpts, onProgress: progress });

			if (args.output === "pretty") {
				console.log(formatPretty(result));
			} else {
				console.log(JSON.stringify(result, null, 2));
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Error: ${message}\n`);
		process.exit(1);
	}
}

main();
