import type { NewprConfig } from "../types/config.ts";
import { createRoutes } from "./server/routes.ts";
import index from "./index.html";

interface WebServerOptions {
	port: number;
	token: string;
	config: NewprConfig;
}

export async function startWebServer(options: WebServerOptions): Promise<void> {
	const { port, token, config } = options;
	const routes = createRoutes(token, config);

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		routes: {
			"/": index,
			"/api/analysis": {
				POST: routes["POST /api/analysis"],
			},
			"/api/sessions": {
				GET: routes["GET /api/sessions"],
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
