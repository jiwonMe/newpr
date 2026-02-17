import { join, dirname } from "node:path";
import type { NewprConfig } from "../types/config.ts";
import { createRoutes } from "./server/routes.ts";
import index from "./index.html";

interface WebServerOptions {
	port: number;
	token: string;
	config: NewprConfig;
}

async function buildCss(): Promise<string> {
	const webDir = dirname(Bun.resolveSync("./src/web/index.html", process.cwd()));
	const input = join(webDir, "styles", "globals.css");
	const output = join(webDir, "styles", "built.css");

	const result = Bun.spawnSync({
		cmd: ["bunx", "@tailwindcss/cli", "-i", input, "-o", output, "--minify"],
		cwd: process.cwd(),
		stderr: "pipe",
		stdout: "pipe",
	});

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString();
		throw new Error(`Tailwind CSS build failed: ${stderr}`);
	}

	return output;
}

export async function startWebServer(options: WebServerOptions): Promise<void> {
	const { port, token, config } = options;
	const routes = createRoutes(token, config);

	const cssPath = await buildCss();

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		routes: {
			"/": index,
			"/styles.css": async () => {
				const file = Bun.file(cssPath);
				return new Response(file, {
					headers: { "content-type": "text/css; charset=utf-8" },
				});
			},
			"/api/analysis": {
				POST: routes["POST /api/analysis"],
			},
			"/api/sessions": {
				GET: routes["GET /api/sessions"],
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
			if (path.match(/^\/api\/sessions\/[^/]+$/) && req.method === "GET") {
				return routes["GET /api/sessions/:id"](req);
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
