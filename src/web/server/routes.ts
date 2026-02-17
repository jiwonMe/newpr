import type { NewprConfig } from "../../types/config.ts";
import type { NewprOutput } from "../../types/output.ts";
import { DEFAULT_CONFIG } from "../../types/config.ts";
import { listSessions, loadSession, loadSinglePatch, savePatchesSidecar } from "../../history/store.ts";
import { fetchPrDiff } from "../../github/fetch-diff.ts";
import { parseDiff } from "../../diff/parser.ts";
import { parsePrInput } from "../../github/parse-pr.ts";
import { writeStoredConfig, type StoredConfig } from "../../config/store.ts";
import { startAnalysis, getSession, cancelAnalysis, subscribe } from "./session-manager.ts";
import { generateCartoon } from "../../llm/cartoon.ts";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

interface RouteOptions {
	cartoon?: boolean;
}

export function createRoutes(token: string, config: NewprConfig, options: RouteOptions = {}) {
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
				historyId: session.historyId,
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

		"GET /api/sessions/:id/diff": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;
			const filePath = url.searchParams.get("path");
			if (!filePath) return json({ error: "Missing 'path' query parameter" }, 400);

			const patch = await loadSinglePatch(id, filePath);
			if (patch) return json({ patch, path: filePath });

			let prUrl: string | null = null;
			let storeId = id;

			const storedSession = await loadSession(id);
			if (storedSession) {
				prUrl = storedSession.meta.pr_url;
			} else {
				const liveSession = getSession(id);
				if (liveSession?.result?.meta?.pr_url) {
					prUrl = liveSession.result.meta.pr_url;
					if (liveSession.historyId) storeId = liveSession.historyId;
				} else if (liveSession?.historyId) {
					const histPatch = await loadSinglePatch(liveSession.historyId, filePath);
					if (histPatch) return json({ patch: histPatch, path: filePath });

					const histSession = await loadSession(liveSession.historyId);
					if (histSession) {
						prUrl = histSession.meta.pr_url;
						storeId = liveSession.historyId;
					}
				}
			}

			if (!prUrl) return json({ error: "Session not found" }, 404);

			try {
				const pr = parsePrInput(prUrl);
				const rawDiff = await fetchPrDiff(pr, token);
				const parsed = parseDiff(rawDiff);

				const allPatches: Record<string, string> = {};
				for (const file of parsed.files) {
					allPatches[file.path] = file.raw;
				}
				await savePatchesSidecar(storeId, allPatches).catch(() => {});

				const backfilledPatch = allPatches[filePath];
				if (!backfilledPatch) return json({ error: "File not found in diff" }, 404);
				return json({ patch: backfilledPatch, path: filePath });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: `Failed to fetch diff: ${msg}` }, 500);
			}
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

		"GET /api/features": () => {
			return json({ cartoon: !!options.cartoon });
		},

		"POST /api/cartoon": async (req: Request) => {
			if (!options.cartoon) return json({ error: "Cartoon mode not enabled. Start with --cartoon flag." }, 403);
			if (!config.openrouter_api_key) return json({ error: "OpenRouter API key required for cartoon generation" }, 400);

			try {
				const body = await req.json() as { data?: NewprOutput; sessionId?: string };
				let data = body.data;
				const sessionId = body.sessionId;

				if (!data && sessionId) {
					data = await loadSession(sessionId) as NewprOutput | null ?? undefined;
				}
				if (!data) return json({ error: "Missing analysis data" }, 400);

				const result = await generateCartoon(config.openrouter_api_key, data, config.language);

				if (sessionId) {
					const sessionData = await loadSession(sessionId);
					if (sessionData) {
						sessionData.cartoon = {
							imageBase64: result.imageBase64,
							mimeType: result.mimeType,
							generatedAt: new Date().toISOString(),
						};
						const { join } = await import("node:path");
						const { homedir } = await import("node:os");
						const sessionsDir = join(homedir(), ".newpr", "history", "sessions");
						await Bun.write(join(sessionsDir, `${sessionId}.json`), JSON.stringify(sessionData, null, 2));
					}
				}

				return json(result);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},
	};
}
