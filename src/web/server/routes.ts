import type { NewprConfig } from "../../types/config.ts";
import { DEFAULT_CONFIG } from "../../types/config.ts";
import { listSessions, loadSession } from "../../history/store.ts";
import { writeStoredConfig, type StoredConfig } from "../../config/store.ts";
import { startAnalysis, getSession, cancelAnalysis, subscribe } from "./session-manager.ts";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function createRoutes(token: string, config: NewprConfig) {
	return {
		"POST /api/analysis": async (req: Request) => {
			const body = await req.json() as { pr: string };
			if (!body.pr) return json({ error: "Missing 'pr' field" }, 400);

			const result = startAnalysis(body.pr, token, config);
			if ("error" in result) return json({ error: result.error }, result.status);

			return json({
				sessionId: result.sessionId,
				eventsUrl: `/api/analysis/${result.sessionId}/events`,
			});
		},

		"GET /api/analysis/:id": (req: Request) => {
			const url = new URL(req.url);
			const id = url.pathname.split("/").pop()!;
			const session = getSession(id);
			if (!session) return json({ error: "Session not found" }, 404);

			return json({
				id: session.id,
				status: session.status,
				startedAt: session.startedAt,
				finishedAt: session.finishedAt,
				error: session.error,
				result: session.result,
			});
		},

		"GET /api/analysis/:id/events": (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;

			const session = getSession(id);
			if (!session) return json({ error: "Session not found" }, 404);

			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					const send = (eventType: string, data: string) => {
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};

					const unsubscribe = subscribe(id, (event) => {
						try {
							if ("type" in event && event.type === "done") {
								send("done", JSON.stringify({}));
								controller.close();
							} else if ("type" in event && event.type === "error") {
								send("analysis_error", JSON.stringify({ message: event.data ?? "Unknown error" }));
								controller.close();
							} else {
								send("progress", JSON.stringify(event));
							}
						} catch {
							controller.close();
						}
					});

					if (!unsubscribe) {
						send("analysis_error", JSON.stringify({ message: "Session not found" }));
						controller.close();
					}

					req.signal.addEventListener("abort", () => {
						unsubscribe?.();
						try { controller.close(); } catch {}
					});
				},
			});

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive",
				},
			});
		},

		"POST /api/analysis/:id/cancel": (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;
			const ok = cancelAnalysis(id);
			return json({ ok });
		},

		"GET /api/sessions": async () => {
			const sessions = await listSessions(50);
			return json(sessions);
		},

		"GET /api/sessions/:id": async (req: Request) => {
			const url = new URL(req.url);
			const id = url.pathname.split("/").pop()!;
			const data = await loadSession(id);
			if (!data) return json({ error: "Session not found" }, 404);
			return json(data);
		},

		"GET /api/me": async () => {
			try {
				const res = await fetch("https://api.github.com/user", {
					headers: {
						Authorization: `token ${token}`,
						Accept: "application/vnd.github.v3+json",
						"User-Agent": "newpr-cli",
					},
				});
				if (!res.ok) return json({ login: null });
				const user = await res.json() as Record<string, unknown>;
				return json({
					login: user.login as string,
					avatar_url: user.avatar_url as string,
					html_url: user.html_url as string,
					name: (user.name as string) ?? null,
				});
			} catch {
				return json({ login: null });
			}
		},

		"GET /api/config": async () => {
			return json({
				model: config.model,
				agent: config.agent ?? null,
				language: config.language,
				max_files: config.max_files,
				timeout: config.timeout,
				concurrency: config.concurrency,
				has_api_key: !!config.openrouter_api_key,
				has_github_token: !!token,
				defaults: {
					model: DEFAULT_CONFIG.model,
					language: DEFAULT_CONFIG.language,
					max_files: DEFAULT_CONFIG.max_files,
					timeout: DEFAULT_CONFIG.timeout,
					concurrency: DEFAULT_CONFIG.concurrency,
				},
			});
		},

		"PUT /api/config": async (req: Request) => {
			const body = await req.json() as Partial<StoredConfig>;
			const update: StoredConfig = {};

			if (body.openrouter_api_key !== undefined) update.openrouter_api_key = body.openrouter_api_key;
			if (body.model !== undefined) {
				update.model = body.model;
				config.model = body.model;
			}
			if (body.agent !== undefined) {
				const val = body.agent as string;
				if (val === "claude" || val === "opencode" || val === "codex") {
					update.agent = val;
					config.agent = val;
				} else if (val === "" || val === "auto") {
					update.agent = undefined;
					config.agent = undefined;
				}
			}
			if (body.language !== undefined) {
				update.language = body.language;
				config.language = body.language === "auto"
					? (await import("../../config/index.ts")).detectLanguage()
					: body.language;
			}
			if (body.max_files !== undefined) {
				update.max_files = body.max_files;
				config.max_files = body.max_files;
			}
			if (body.timeout !== undefined) {
				update.timeout = body.timeout;
				config.timeout = body.timeout;
			}
			if (body.concurrency !== undefined) {
				update.concurrency = body.concurrency;
				config.concurrency = body.concurrency;
			}

			await writeStoredConfig(update);
			return json({ ok: true });
		},
	};
}
