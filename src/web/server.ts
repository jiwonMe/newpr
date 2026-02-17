import { join, dirname } from "node:path";
import type { NewprConfig } from "../types/config.ts";
import { createRoutes } from "./server/routes.ts";
import index from "./index.html";

interface WebServerOptions {
	port: number;
	token: string;
	config: NewprConfig;
	cartoon?: boolean;
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
	const { port, token, config, cartoon } = options;
	const routes = createRoutes(token, config, { cartoon });
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
			if (path.match(/^\/api\/sessions\/[^/]+$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id"](req);
			}
			if (path === "/api/proxy" && req.method === "GET") {
				return routes["GET /api/proxy"](req);
			}
			if (path === "/api/features" && req.method === "GET") {
				return routes["GET /api/features"]();
			}
			if (path === "/api/cartoon" && req.method === "POST") {
				return routes["POST /api/cartoon"](req);
			}

			return new Response("Not Found", { status: 404 });
		},
		development: {
			hmr: true,
			console: true,
		},
	});

	console.log(`\n  newpr web UI`);
	console.log(`  Local:   http://localhost:${server.port}\n`);
}
