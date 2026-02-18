import { join, dirname } from "node:path";
import type { NewprConfig } from "../types/config.ts";
import { createRoutes } from "./server/routes.ts";
import index from "./index.html";

import type { PreflightResult } from "../cli/preflight.ts";
import { getVersion } from "../version.ts";

interface WebServerOptions {
	port: number;
	token: string;
	config: NewprConfig;
	cartoon?: boolean;
	preflight?: PreflightResult;
}

function getCssPaths() {
	const webDir = dirname(Bun.resolveSync("./src/web/index.html", process.cwd()));
	return {
		input: join(webDir, "styles", "globals.css"),
		output: join(webDir, "styles", "built.css"),
		bin: join(process.cwd(), "node_modules", ".bin", "tailwindcss"),
	};
}

async function buildCss(bin: string, input: string, output: string): Promise<void> {
	const proc = Bun.spawn(
		[bin, "-i", input, "-o", output, "--minify"],
		{ cwd: process.cwd(), stderr: "pipe", stdout: "pipe" },
	);
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Tailwind CSS build failed (exit ${exitCode}): ${stderr}`);
	}
}

export async function startWebServer(options: WebServerOptions): Promise<void> {
	const { port, token, config, cartoon, preflight } = options;
	const routes = createRoutes(token, config, { cartoon, preflight });
	const css = getCssPaths();

	await buildCss(css.bin, css.input, css.output);

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		routes: {
			"/": index,
			"/styles.css": async () => {
				await buildCss(css.bin, css.input, css.output);
				const file = Bun.file(css.output);
				return new Response(file, {
					headers: {
						"content-type": "text/css; charset=utf-8",
						"cache-control": "no-cache, no-store, must-revalidate",
					},
				});
			},
			"/api/analysis": {
				POST: routes["POST /api/analysis"],
			},
			"/api/sessions": {
				GET: routes["GET /api/sessions"],
			},
			"/api/me": {
				GET: routes["GET /api/me"],
			},
			"/api/config": {
				GET: routes["GET /api/config"],
				PUT: routes["PUT /api/config"],
			},
			"/api/models": {
				GET: routes["GET /api/models"],
			},
			"/api/update-check": {
				GET: routes["GET /api/update-check"],
			},
			"/api/update": {
				POST: routes["POST /api/update"],
			},
		},
		fetch(req) {
			const url = new URL(req.url);
			const path = url.pathname;

			if (path.match(/^\/api\/analysis\/[^/]+\/events$/) && req.method === "GET") {
				return routes["GET /api/analysis/:id/events"](req);
			}
			if (path.match(/^\/api\/analysis\/[^/]+\/cancel$/) && req.method === "POST") {
				return routes["POST /api/analysis/:id/cancel"](req);
			}
			if (path.match(/^\/api\/analysis\/[^/]+$/) && req.method === "GET") {
				return routes["GET /api/analysis/:id"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/diff$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/diff"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/discussion$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/discussion"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/comments\/[^/]+$/) && req.method === "DELETE") {
				return routes["DELETE /api/sessions/:id/comments/:commentId"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/comments\/[^/]+$/) && req.method === "PATCH") {
				return routes["PATCH /api/sessions/:id/comments/:commentId"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/comments$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/comments"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/comments$/) && req.method === "POST") {
				return routes["POST /api/sessions/:id/comments"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/ask-inline$/) && req.method === "POST") {
				return routes["POST /api/sessions/:id/ask-inline"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/outdated$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/outdated"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/chat\/undo$/) && req.method === "POST") {
				return routes["POST /api/sessions/:id/chat/undo"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/chat$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/chat"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/chat$/) && req.method === "POST") {
				return routes["POST /api/sessions/:id/chat"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/cartoon$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/cartoon"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id"](req);
			}
			if (path === "/api/proxy" && req.method === "GET") {
				return routes["GET /api/proxy"](req);
			}
			if (path === "/api/features" && req.method === "GET") {
				return routes["GET /api/features"]();
			}
			if (path === "/api/preflight" && req.method === "GET") {
				return routes["GET /api/preflight"]();
			}
			if (path === "/api/active-analyses" && req.method === "GET") {
				return routes["GET /api/active-analyses"]();
			}
			if (path === "/api/cartoon" && req.method === "POST") {
				return routes["POST /api/cartoon"](req);
			}
			if (path.match(/^\/api\/sessions\/[^/]+\/slides$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id/slides"](req);
			}
			if (path === "/api/slides" && req.method === "POST") {
				return routes["POST /api/slides"](req);
			}
			if (path === "/api/slides/status" && req.method === "GET") {
				return routes["GET /api/slides/status"](req);
			}
			if (path === "/api/plugins" && req.method === "GET") {
				return routes["GET /api/plugins"]();
			}
			if (path.match(/^\/api\/plugins\/[^/]+\/data$/) && req.method === "GET") {
				return routes["GET /api/plugins/:id/data"](req);
			}
			if (path.match(/^\/api\/plugins\/[^/]+\/generate$/) && req.method === "POST") {
				return routes["POST /api/plugins/:id/generate"](req);
			}
			if (path.match(/^\/api\/plugins\/[^/]+\/status$/) && req.method === "GET") {
				return routes["GET /api/plugins/:id/status"](req);
			}
			if (path === "/api/review" && req.method === "POST") {
				return routes["POST /api/review"](req);
			}

			return new Response("Not Found", { status: 404 });
		},
		development: {
			hmr: true,
			console: true,
		},
	});

	const url = `http://localhost:${server.port}`;

	const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
	const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
	const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

	console.log("");
	console.log(`  ${bold("newpr")} ${dim(`v${getVersion()}`)}`);
	console.log("");
	console.log(`  ${dim("→")} Local    ${cyan(url)}`);
	console.log(`  ${dim("→")} Model    ${dim(config.model)}`);
	if (cartoon) console.log(`  ${dim("→")} Comic    ${green("enabled")}`);
	console.log("");
	console.log(`  ${dim("press")} ${bold("ctrl+c")} ${dim("to stop")}`);
	console.log("");

	try {
		const { platform } = process;
		const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
		Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
	} catch {}
}
