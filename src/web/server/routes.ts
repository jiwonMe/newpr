import type { NewprConfig } from "../../types/config.ts";
import type { NewprOutput, ChatMessage, ChatToolCall, ChatSegment } from "../../types/output.ts";
import { DEFAULT_CONFIG } from "../../types/config.ts";
import { listSessions, loadSession, loadSinglePatch, savePatchesSidecar, loadCommentsSidecar, saveCommentsSidecar, loadChatSidecar, saveChatSidecar, loadPatchesSidecar, saveCartoonSidecar, loadCartoonSidecar, saveSlidesSidecar, loadSlidesSidecar } from "../../history/store.ts";
import type { DiffComment } from "../../types/output.ts";
import { fetchPrDiff } from "../../github/fetch-diff.ts";
import { fetchPrBody, fetchPrComments } from "../../github/fetch-pr.ts";
import { parseDiff } from "../../diff/parser.ts";
import { parsePrInput } from "../../github/parse-pr.ts";
import { readStoredConfig, writeStoredConfig, type StoredConfig } from "../../config/store.ts";
import { startAnalysis, getSession, cancelAnalysis, subscribe, listActiveSessions } from "./session-manager.ts";
import { generateCartoon } from "../../llm/cartoon.ts";
import { generateSlides } from "../../llm/slides.ts";
import { getPlugin, getAllPlugins } from "../../plugins/registry.ts";
import { chatWithTools, type ChatTool, type ChatStreamEvent } from "../../llm/client.ts";
import { detectAgents, runAgent } from "../../workspace/agent.ts";
import { randomBytes } from "node:crypto";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

import type { PreflightResult } from "../../cli/preflight.ts";

interface RouteOptions {
	cartoon?: boolean;
	preflight?: PreflightResult;
}

export function createRoutes(token: string, config: NewprConfig, options: RouteOptions = {}) {
	const ghHeaders = {
		Authorization: `token ${token}`,
		Accept: "application/vnd.github.v3+json",
		"User-Agent": "newpr-cli",
		"Content-Type": "application/json",
	};

	async function resolvePrUrl(sessionId: string): Promise<string | null> {
		const stored = await loadSession(sessionId);
		if (stored) return stored.meta.pr_url;
		const live = getSession(sessionId);
		if (live?.result?.meta?.pr_url) return live.result.meta.pr_url;
		if (live?.historyId) {
			const hist = await loadSession(live.historyId);
			if (hist) return hist.meta.pr_url;
		}
		return null;
	}

	async function fetchHeadSha(pr: { owner: string; repo: string; number: number }): Promise<string | null> {
		try {
			const res = await fetch(`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, { headers: ghHeaders });
			if (!res.ok) return null;
			const data = await res.json() as { head?: { sha?: string } };
			return data.head?.sha ?? null;
		} catch {
			return null;
		}
	}

	async function fetchCurrentUser(): Promise<{ login: string; avatar_url?: string }> {
		try {
			const res = await fetch("https://api.github.com/user", { headers: ghHeaders });
			if (res.ok) {
				const user = await res.json() as Record<string, unknown>;
				return { login: user.login as string, avatar_url: user.avatar_url as string | undefined };
			}
		} catch {}
		return { login: "anonymous" };
	}

	interface SlideJob {
		status: "running" | "done" | "error";
		message: string;
		current: number;
		total: number;
		plan?: { stylePrompt: string; slides: Array<{ index: number; title: string; contentPrompt: string }> };
		imagePrompts?: Array<{ index: number; prompt: string }>;
	}
	const slideJobs = new Map<string, SlideJob>();

	interface PluginJob {
		status: "running" | "done" | "error";
		message: string;
		current: number;
		total: number;
	}
	const pluginJobs = new Map<string, PluginJob>();

	function buildChatSystemPrompt(data: NewprOutput): string {
		const fileSummaries = data.files
			.map((f) => `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions}): ${f.summary}`)
			.join("\n");
		const groupSummaries = data.groups
			.map((g) => `- [${g.type}] ${g.name}: ${g.description}\n  Files: ${g.files.join(", ")}`)
			.join("\n");

		return `You are an expert code reviewer assistant for a Pull Request analysis tool called "newpr".
You have access to the full analysis of PR #${data.meta.pr_number} "${data.meta.pr_title}" in ${data.meta.pr_url}.

## Analysis Context

**Author**: ${data.meta.author}
**Branches**: ${data.meta.head_branch} → ${data.meta.base_branch}
**Stats**: ${data.meta.total_files_changed} files, +${data.meta.total_additions} -${data.meta.total_deletions}
**Risk**: ${data.summary.risk_level}

**Purpose**: ${data.summary.purpose}
**Scope**: ${data.summary.scope}
**Impact**: ${data.summary.impact}

## File Changes
${fileSummaries}

## Change Groups
${groupSummaries}

## Narrative
${data.narrative}

${data.meta.pr_body ? `## PR Description\n${data.meta.pr_body}` : ""}

## Anchor Syntax (CRITICAL)
You MUST use these anchors. They become clickable links in the UI.

1. Group: [[group:Exact Group Name]] — renders as a clickable chip.
2. File: [[file:exact/path/here.ts]] — renders as a clickable chip.
3. Line reference: [[line:exact/path/here.ts#L42-L50]](descriptive text) — the "descriptive text" becomes an underlined link that opens the diff scrolled to that line. The line info is NOT shown — only the text is visible.

RULES:
- Use EXACT paths and names from the lists above.
- For line references, ALWAYS use [[line:path#L-L]](text). NEVER bare [[line:...]] without (text).
- The (text) should describe what the code does, NOT show file names or line numbers.
- Do NOT place [[file:...]] and [[line:...]] adjacent for the same file.
- Use the get_file_diff tool to find exact line numbers before referencing them.
- Aim for most statements about code to include at least one line reference.

## Math / LaTeX
When expressing mathematical formulas, algorithms, or complexity analysis, use LaTeX syntax:
- Inline: $O(n \\log n)$, $\\sum_{i=1}^{n} x_i$
- Block:
$$
f(x) = \\int_{a}^{b} g(t) \\, dt
$$

## Instructions
- Answer questions about this PR thoroughly and precisely.
- Use your tools to fetch additional context when needed (file diffs, comments, reviews).
- When referencing code, include relevant snippets from the diff.
- Be concise but thorough. Use markdown formatting.
- If the user asks in Korean, respond in Korean. Match the user's language.`;
	}

	function buildChatTools(): ChatTool[] {
		return [
			{
				type: "function",
				function: {
					name: "get_file_diff",
					description: "Get the full unified diff for a specific file in this PR. Use this to see exact code changes.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "File path (e.g. 'src/index.ts')" },
						},
						required: ["path"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "list_files",
					description: "List all changed files in this PR with their status, line counts, and summaries.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "get_pr_comments",
					description: "Get all issue comments (discussion) on this PR from GitHub.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "get_review_comments",
					description: "Get all inline review comments on specific lines of code in this PR from GitHub.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "get_pr_details",
					description: "Get PR metadata from GitHub: state, mergeable status, labels, requested reviewers, etc.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "run_react_doctor",
					description: "Run react-doctor on the PR's codebase to get a React code quality score (0-100) and diagnostics for security, performance, correctness, and architecture issues. Only useful for React/JSX/TSX projects.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "web_search",
					description: "Search the web for documentation, library references, best practices, or any technical question. Returns top search results with snippets.",
					parameters: {
						type: "object",
						properties: {
							query: { type: "string", description: "Search query (e.g. 'React useEffect cleanup pattern', 'zod discriminated union')" },
						},
						required: ["query"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "web_fetch",
					description: "Fetch the text content of a web page. Use this to read documentation pages, blog posts, or API references found via web_search.",
					parameters: {
						type: "object",
						properties: {
							url: { type: "string", description: "URL to fetch (must start with https://)" },
						},
						required: ["url"],
					},
				},
			},
		];
	}

	return {
		"POST /api/analysis": async (req: Request) => {
			const body = await req.json() as { pr: string; reuseSessionId?: string };
			if (!body.pr) return json({ error: "Missing 'pr' field" }, 400);

			const result = startAnalysis(body.pr, token, config);
			if ("error" in result) return json({ error: result.error }, result.status);

			return json({
				sessionId: result.sessionId,
				reuseSessionId: body.reuseSessionId,
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

		"GET /api/sessions/:id/discussion": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;

			let prUrl: string | null = null;
			let body: string | null = null;

			const storedSession = await loadSession(id);
			if (storedSession) {
				prUrl = storedSession.meta.pr_url;
				body = storedSession.meta.pr_body ?? null;
			} else {
				const liveSession = getSession(id);
				if (liveSession?.result?.meta?.pr_url) {
					prUrl = liveSession.result.meta.pr_url;
					body = liveSession.result.meta.pr_body ?? null;
				} else if (liveSession?.historyId) {
					const histSession = await loadSession(liveSession.historyId);
					if (histSession) {
						prUrl = histSession.meta.pr_url;
						body = histSession.meta.pr_body ?? null;
					}
				}
			}

			if (!prUrl) return json({ error: "Session not found" }, 404);

			try {
				const pr = parsePrInput(prUrl);
				if (body === null) {
					body = await fetchPrBody(pr, token);
				}
				const comments = await fetchPrComments(pr, token);
				return json({ body, comments });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: `Failed to fetch discussion: ${msg}` }, 500);
			}
		},

		"GET /api/proxy": async (req: Request) => {
			const url = new URL(req.url);
			const target = url.searchParams.get("url");
			if (!target) return json({ error: "Missing 'url' query parameter" }, 400);

			const allowed = target.startsWith("https://github.com/") || target.startsWith("https://user-images.githubusercontent.com/");
			if (!allowed) return json({ error: "URL not allowed" }, 403);

			try {
				const headers: Record<string, string> = { "User-Agent": "newpr-cli" };
				if (token && target.startsWith("https://github.com/")) {
					headers.Authorization = `token ${token}`;
				}
				const res = await fetch(target, { headers, redirect: "follow" });
				if (!res.ok) return new Response(null, { status: res.status });

				const contentType = res.headers.get("content-type") ?? "application/octet-stream";
				return new Response(res.body, {
					headers: {
						"Content-Type": contentType,
						"Cache-Control": "public, max-age=86400, immutable",
					},
				});
			} catch {
				return new Response(null, { status: 502 });
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
			const stored = await readStoredConfig();
			const pluginList = getAllPlugins().map((p) => ({ id: p.id, name: p.name }));
			const enabledPlugins = stored.enabled_plugins ?? pluginList.map((p) => p.id);
			return json({
				model: config.model,
				agent: config.agent ?? null,
				language: config.language,
				max_files: config.max_files,
				timeout: config.timeout,
				concurrency: config.concurrency,
				has_api_key: !!config.openrouter_api_key,
				has_github_token: !!token,
				enabled_plugins: enabledPlugins,
				available_plugins: pluginList,
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
			if ((body as Record<string, unknown>).enabled_plugins !== undefined) {
				update.enabled_plugins = (body as Record<string, unknown>).enabled_plugins as string[];
			}

			await writeStoredConfig(update);
			return json({ ok: true });
		},

		"GET /api/features": async () => {
			const { getVersion } = require("../../version.ts");
			const stored = await readStoredConfig();
			const allPluginIds = getAllPlugins().map((p) => p.id);
			const enabledPlugins = stored.enabled_plugins ?? allPluginIds;
			return json({ cartoon: !!options.cartoon, version: getVersion(), enabledPlugins });
		},

		"POST /api/review": async (req: Request) => {
			const body = await req.json() as { pr_url: string; event: string; body?: string };
			if (!body.pr_url || !body.event) return json({ error: "Missing pr_url or event" }, 400);

			const validEvents = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];
			if (!validEvents.includes(body.event)) return json({ error: `Invalid event: ${body.event}` }, 400);

			try {
				const pr = parsePrInput(body.pr_url);
				const res = await fetch(
					`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
					{
						method: "POST",
						headers: ghHeaders,
						body: JSON.stringify({
							body: body.body ?? "",
							event: body.event,
						}),
					},
				);
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({})) as { message?: string };
					return json({ error: errBody.message ?? `GitHub API error: ${res.status}` }, res.status);
				}
				const data = await res.json() as { id: number; state: string; html_url: string };
				return json({ ok: true, id: data.id, state: data.state, html_url: data.html_url });
			} catch (err) {
				return json({ error: err instanceof Error ? err.message : String(err) }, 500);
			}
		},

		"GET /api/preflight": () => {
			return json(options.preflight ?? null);
		},

		"GET /api/active-analyses": () => {
			return json(listActiveSessions());
		},

		"GET /api/sessions/:id/comments": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[3]!;
			const filePath = url.searchParams.get("path");

			const comments = await loadCommentsSidecar(id) ?? [];
			const filtered = filePath ? comments.filter((c) => c.filePath === filePath) : comments;
			return json(filtered);
		},

		"POST /api/sessions/:id/comments": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;

			const body = await req.json() as { filePath?: string; line?: number; startLine?: number; side?: string; body?: string };
			if (!body.filePath || body.line == null || !body.side || !body.body?.trim()) {
				return json({ error: "Missing required fields" }, 400);
			}

			const user = await fetchCurrentUser();
			const prUrl = await resolvePrUrl(sessionId);

			let githubCommentId: number | undefined;
			let githubCommentUrl: string | undefined;
			if (prUrl) {
				try {
					const pr = parsePrInput(prUrl);
					const sha = await fetchHeadSha(pr);
					if (sha) {
						const ghSide = body.side === "old" ? "LEFT" : "RIGHT";
						const ghBody: Record<string, unknown> = {
							commit_id: sha,
							path: body.filePath,
							line: body.line,
							side: ghSide,
							body: body.body.trim(),
						};
						if (body.startLine != null && body.startLine !== body.line) {
							ghBody.start_line = body.startLine;
							ghBody.start_side = ghSide;
						}
						const res = await fetch(
							`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments`,
							{
								method: "POST",
								headers: ghHeaders,
								body: JSON.stringify(ghBody),
							},
						);
						if (res.ok) {
							const data = await res.json() as { id?: number; html_url?: string };
							githubCommentId = data.id;
							githubCommentUrl = data.html_url;
						}
					}
				} catch {}
			}

			const hasRange = body.startLine != null && body.startLine !== body.line;
			const comment: DiffComment = {
				id: randomBytes(8).toString("hex"),
				sessionId,
				filePath: body.filePath,
				line: body.line,
				...(hasRange ? { startLine: body.startLine } : {}),
				side: body.side as "old" | "new",
				body: body.body.trim(),
				author: user.login,
				authorAvatar: user.avatar_url,
				createdAt: new Date().toISOString(),
				githubUrl: githubCommentUrl,
				githubCommentId,
			};

			const existing = await loadCommentsSidecar(sessionId) ?? [];
			existing.push(comment);
			await saveCommentsSidecar(sessionId, existing);

			return json(comment, 201);
		},

		"PATCH /api/sessions/:id/comments/:commentId": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;
			const commentId = segments[5]!;

			const body = await req.json() as { body?: string };
			if (!body.body?.trim()) return json({ error: "Missing body" }, 400);

			const existing = await loadCommentsSidecar(sessionId) ?? [];
			const comment = existing.find((c) => c.id === commentId);
			if (!comment) return json({ error: "Comment not found" }, 404);

			comment.body = body.body.trim();

			if (comment.githubCommentId) {
				const prUrl = await resolvePrUrl(sessionId);
				if (prUrl) {
					try {
						const pr = parsePrInput(prUrl);
						await fetch(
							`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/comments/${comment.githubCommentId}`,
							{
								method: "PATCH",
								headers: ghHeaders,
								body: JSON.stringify({ body: comment.body }),
							},
						);
					} catch {}
				}
			}

			await saveCommentsSidecar(sessionId, existing);
			return json(comment);
		},

		"DELETE /api/sessions/:id/comments/:commentId": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;
			const commentId = segments[5]!;

			const existing = await loadCommentsSidecar(sessionId) ?? [];
			const idx = existing.findIndex((c) => c.id === commentId);
			if (idx === -1) return json({ error: "Comment not found" }, 404);

			const removed = existing[idx]!;
			if (removed.githubCommentId) {
				const prUrl = await resolvePrUrl(sessionId);
				if (prUrl) {
					try {
						const pr = parsePrInput(prUrl);
						await fetch(
							`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/comments/${removed.githubCommentId}`,
							{ method: "DELETE", headers: ghHeaders },
						);
					} catch {}
				}
			}

			existing.splice(idx, 1);
			await saveCommentsSidecar(sessionId, existing);

			return json({ ok: true });
		},

		"POST /api/sessions/:id/ask-inline": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;

			if (!config.openrouter_api_key) {
				return json({ error: "OpenRouter API key required" }, 400);
			}

			const body = await req.json() as { message: string };
			if (!body.message?.trim()) return json({ error: "Missing message" }, 400);

			const sessionData = await loadSession(sessionId);
			if (!sessionData) return json({ error: "Session not found" }, 404);

			const systemPrompt = buildChatSystemPrompt(sessionData);
			const apiMessages = [
				{ role: "system" as const, content: systemPrompt },
				{ role: "user" as const, content: body.message.trim() },
			];

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				async start(controller) {
					const send = (eventType: string, data: string) => {
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};
					try {
						await chatWithTools(
							{ api_key: config.openrouter_api_key, model: config.model, timeout: config.timeout },
							apiMessages as Parameters<typeof chatWithTools>[1],
							buildChatTools(),
							async (name: string, args: Record<string, unknown>): Promise<string> => {
								if (name === "get_file_diff") {
									const filePath = args.path as string;
									if (!filePath) return "Error: path required";
									const patches = await loadPatchesSidecar(sessionId);
									if (patches?.[filePath]) return patches[filePath];
									const patch = await loadSinglePatch(sessionId, filePath);
									if (patch) return patch;
									return `File "${filePath}" not found`;
								}
								if (name === "list_files") {
									return sessionData.files.map((f) => `${f.path} (${f.status}): ${f.summary}`).join("\n");
								}
								return `Tool ${name} not available in inline mode`;
							},
							(event: ChatStreamEvent) => {
								if (event.type === "text") send("text", JSON.stringify({ content: event.content }));
								else if (event.type === "error") send("chat_error", JSON.stringify({ message: event.error }));
								else if (event.type === "done") send("done", JSON.stringify({}));
							},
						);
						send("done", JSON.stringify({}));
					} catch (err) {
						send("chat_error", JSON.stringify({ message: err instanceof Error ? err.message : String(err) }));
					} finally {
						controller.close();
					}
				},
			});

			return new Response(stream, {
				headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
			});
		},

		"GET /api/sessions/:id/outdated": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[3]!;
			const sessionData = await loadSession(id);
			if (!sessionData) return json({ error: "Session not found" }, 404);

			const prUrl = sessionData.meta.pr_url;
			const analyzedUpdatedAt = sessionData.meta.pr_updated_at;
			if (!analyzedUpdatedAt) return json({ outdated: false, reason: "no_baseline" });

			try {
				const pr = parsePrInput(prUrl);
				const res = await fetch(
					`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
					{ headers: ghHeaders },
				);
				if (!res.ok) return json({ outdated: false, reason: "api_error" });
				const data = await res.json() as { updated_at?: string; title?: string; state?: string; merged?: boolean; draft?: boolean };
				const currentUpdatedAt = data.updated_at ?? "";
				const outdated = currentUpdatedAt !== analyzedUpdatedAt;
				return json({
					outdated,
					analyzed_at: sessionData.meta.analyzed_at,
					analyzed_updated_at: analyzedUpdatedAt,
					current_updated_at: currentUpdatedAt,
					current_title: data.title,
					current_state: data.draft ? "draft" : data.merged ? "merged" : data.state === "closed" ? "closed" : "open",
				});
			} catch {
				return json({ outdated: false, reason: "fetch_error" });
			}
		},

		"GET /api/sessions/:id/chat": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[3]!;
			const messages = await loadChatSidecar(id) ?? [];
			return json(messages);
		},

		"POST /api/sessions/:id/chat/undo": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;
			const chatHistory = await loadChatSidecar(sessionId) ?? [];
			if (chatHistory.length === 0) return json({ ok: true, removed: 0 });
			const lastAssistantIdx = chatHistory.findLastIndex((m) => m.role === "assistant");
			if (lastAssistantIdx === -1) return json({ ok: true, removed: 0 });
			const lastUserIdx = chatHistory.slice(0, lastAssistantIdx).findLastIndex((m) => m.role === "user");
			const removeFrom = lastUserIdx >= 0 ? lastUserIdx : lastAssistantIdx;
			const removed = chatHistory.length - removeFrom;
			const updated = chatHistory.slice(0, removeFrom);
			await saveChatSidecar(sessionId, updated);
			return json({ ok: true, removed });
		},

		"POST /api/sessions/:id/chat": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const sessionId = segments[3]!;

			if (!config.openrouter_api_key) {
				return json({ error: "OpenRouter API key required for chat" }, 400);
			}

			const body = await req.json() as { message: string };
			if (!body.message?.trim()) return json({ error: "Missing message" }, 400);

			const sessionData = await loadSession(sessionId);
			if (!sessionData) return json({ error: "Session not found" }, 404);

			const chatHistory = await loadChatSidecar(sessionId) ?? [];

			const userMsg: ChatMessage = {
				role: "user",
				content: body.message.trim(),
				timestamp: new Date().toISOString(),
			};
			chatHistory.push(userMsg);
			await saveChatSidecar(sessionId, chatHistory);

			const systemPrompt = buildChatSystemPrompt(sessionData);

			const apiMessages: Array<{ role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = [
				{ role: "system", content: systemPrompt },
			];
			for (const msg of chatHistory) {
				if (msg.role === "user") {
					apiMessages.push({ role: "user", content: msg.content });
				} else if (msg.role === "assistant") {
					if (msg.toolCalls && msg.toolCalls.length > 0) {
						apiMessages.push({
							role: "assistant",
							content: msg.content || null,
							tool_calls: msg.toolCalls.map((tc) => ({
								id: tc.id,
								type: "function",
								function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
							})),
						});
						for (const tc of msg.toolCalls) {
							if (tc.result !== undefined) {
								apiMessages.push({
									role: "tool",
									content: tc.result,
									tool_call_id: tc.id,
								});
							}
						}
					} else {
						apiMessages.push({ role: "assistant", content: msg.content });
					}
				}
			}

			const chatTools = buildChatTools();

			const patches = await loadPatchesSidecar(sessionId);

			const executeTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
				switch (name) {
					case "get_file_diff": {
						const filePath = args.path as string;
						if (!filePath) return "Error: path argument required";
						if (patches?.[filePath]) return patches[filePath];
						const patch = await loadSinglePatch(sessionId, filePath);
						if (patch) return patch;
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const rawDiff = await fetchPrDiff(pr, token);
							const parsed = parseDiff(rawDiff);
							const file = parsed.files.find((f) => f.path === filePath);
							return file?.raw ?? `File "${filePath}" not found in diff`;
						} catch (err) {
							return `Error fetching diff: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "list_files": {
						return sessionData.files
							.map((f) => `${f.path} (${f.status}, +${f.additions}/-${f.deletions}): ${f.summary}`)
							.join("\n");
					}
					case "get_pr_comments": {
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const comments = await fetchPrComments(pr, token);
							if (comments.length === 0) return "No comments on this PR.";
							return comments.map((c) => `@${c.author} (${c.created_at}):\n${c.body}`).join("\n\n---\n\n");
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "get_review_comments": {
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const res = await fetch(
								`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments?per_page=100`,
								{ headers: ghHeaders },
							);
							if (!res.ok) return `GitHub API error: ${res.status}`;
							const reviews = await res.json() as Array<{ user?: { login?: string }; path?: string; body?: string; created_at?: string; line?: number }>;
							if (reviews.length === 0) return "No review comments on this PR.";
							return reviews.map((r) =>
								`@${r.user?.login ?? "unknown"} on ${r.path ?? "?"}${r.line ? `:${r.line}` : ""} (${r.created_at}):\n${r.body ?? ""}`,
							).join("\n\n---\n\n");
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "get_pr_details": {
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const res = await fetch(
								`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
								{ headers: ghHeaders },
							);
							if (!res.ok) return `GitHub API error: ${res.status}`;
							const data = await res.json() as Record<string, unknown>;
							return JSON.stringify({
								title: data.title,
								body: data.body,
								state: data.state,
								merged: data.merged,
								mergeable: data.mergeable,
								additions: data.additions,
								deletions: data.deletions,
								changed_files: data.changed_files,
								labels: (data.labels as Array<{ name: string }>)?.map((l) => l.name),
								requested_reviewers: (data.requested_reviewers as Array<{ login: string }>)?.map((r) => r.login),
							}, null, 2);
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "run_react_doctor": {
						const agents = await detectAgents();
						if (agents.length > 0) {
							try {
								const result = await runAgent(
									agents[0]!,
									process.cwd(),
									"Run react-doctor on this project:\n\nnpx -y react-doctor@latest . --verbose\n\nReturn the FULL output including the score and all diagnostics.",
									{ timeout: 60_000 },
								);
								if (result.answer.trim()) return result.answer;
							} catch {}
						}
						try {
							const proc = Bun.spawn(["npx", "-y", "react-doctor@latest", ".", "--verbose"], {
								cwd: process.cwd(),
								stdout: "pipe",
								stderr: "pipe",
							});
							const output = await new Response(proc.stdout).text();
							const stderr = await new Response(proc.stderr).text();
							return output.trim() || stderr.trim() || "react-doctor produced no output";
						} catch (err) {
							return `Error running react-doctor: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "web_search": {
						const query = args.query as string;
						if (!query) return "Error: query argument required";
						const agents = await detectAgents();
						if (agents.length > 0) {
							try {
								const result = await runAgent(agents[0]!, process.cwd(), `Search the web for: "${query}"\n\nReturn the top results with titles, URLs, and brief descriptions. Be concise.`, { timeout: 30_000 });
								if (result.answer.trim()) return result.answer;
							} catch {}
						}
						try {
							const encoded = encodeURIComponent(query);
							const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
								headers: { "User-Agent": "newpr-cli/0.2.0" },
							});
							if (!res.ok) return `Search failed: HTTP ${res.status}`;
							const html = await res.text();
							const results: string[] = [];
							const resultRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
							let m;
							while ((m = resultRe.exec(html)) !== null && results.length < 8) {
								const href = m[1]?.replace(/&amp;/g, "&") ?? "";
								const title = (m[2] ?? "").replace(/<[^>]+>/g, "").trim();
								const snippet = (m[3] ?? "").replace(/<[^>]+>/g, "").trim();
								if (title && href) results.push(`${title}\n${href}\n${snippet}`);
							}
							if (results.length === 0) return `No results found for "${query}"`;
							return results.join("\n\n---\n\n");
						} catch (err) {
							return `Search error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "web_fetch": {
						const url = args.url as string;
						if (!url?.startsWith("https://")) return "Error: url must start with https://";
						const agents = await detectAgents();
						if (agents.length > 0) {
							try {
								const result = await runAgent(agents[0]!, process.cwd(), `Fetch and summarize the content of this URL: ${url}\n\nReturn the key information from the page. Be thorough but concise.`, { timeout: 30_000 });
								if (result.answer.trim()) return result.answer;
							} catch {}
						}
						try {
							const controller = new AbortController();
							const t = setTimeout(() => controller.abort(), 15000);
							const res = await fetch(url, {
								signal: controller.signal,
								headers: { "User-Agent": "newpr-cli/0.2.0", Accept: "text/html,text/plain,application/json" },
								redirect: "follow",
							});
							clearTimeout(t);
							if (!res.ok) return `Fetch failed: HTTP ${res.status}`;
							const contentType = res.headers.get("content-type") ?? "";
							const text = await res.text();
							if (contentType.includes("json")) return text.slice(0, 15000);
							const stripped = text
								.replace(/<script[\s\S]*?<\/script>/gi, "")
								.replace(/<style[\s\S]*?<\/style>/gi, "")
								.replace(/<nav[\s\S]*?<\/nav>/gi, "")
								.replace(/<footer[\s\S]*?<\/footer>/gi, "")
								.replace(/<header[\s\S]*?<\/header>/gi, "")
								.replace(/<[^>]+>/g, " ")
								.replace(/\s+/g, " ")
								.trim();
							return stripped.slice(0, 15000) + (stripped.length > 15000 ? "\n\n... (truncated)" : "");
						} catch (err) {
							return `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					default:
						return `Unknown tool: ${name}`;
				}
			};

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				async start(controller) {
					const send = (eventType: string, data: string) => {
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};

					let fullText = "";
					const collectedToolCalls: ChatToolCall[] = [];
					const orderedSegments: ChatSegment[] = [];
					let lastSegmentWasText = false;

					try {
						await chatWithTools(
							{
								api_key: config.openrouter_api_key,
								model: config.model,
								timeout: config.timeout,
							},
							apiMessages as Parameters<typeof chatWithTools>[1],
							chatTools,
							executeTool,
							(event: ChatStreamEvent) => {
								switch (event.type) {
									case "text":
										fullText += event.content ?? "";
										if (lastSegmentWasText && orderedSegments.length > 0) {
											const last = orderedSegments[orderedSegments.length - 1]!;
											if (last.type === "text") {
												last.content += event.content ?? "";
											}
										} else {
											orderedSegments.push({ type: "text", content: event.content ?? "" });
											lastSegmentWasText = true;
										}
										send("text", JSON.stringify({ content: event.content }));
										break;
									case "tool_call":
										if (event.toolCall) {
											let args: Record<string, unknown> = {};
											try { args = JSON.parse(event.toolCall.arguments); } catch {}
											const tc: ChatToolCall = {
												id: event.toolCall.id,
												name: event.toolCall.name,
												arguments: args,
											};
											collectedToolCalls.push(tc);
											orderedSegments.push({ type: "tool_call", toolCall: tc });
											lastSegmentWasText = false;
											send("tool_call", JSON.stringify({
												id: event.toolCall.id,
												name: event.toolCall.name,
												arguments: args,
											}));
										}
										break;
									case "tool_result":
										if (event.toolResult) {
											const tc = collectedToolCalls.find((c) => c.id === event.toolResult!.id);
											if (tc) tc.result = event.toolResult.result;
											send("tool_result", JSON.stringify(event.toolResult));
										}
										break;
									case "error":
										send("chat_error", JSON.stringify({ message: event.error }));
										break;
									case "done":
										break;
								}
							},
						);

						const assistantMsg: ChatMessage = {
							role: "assistant",
							content: fullText,
							toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
							segments: orderedSegments.length > 0 ? orderedSegments : undefined,
							timestamp: new Date().toISOString(),
						};
						chatHistory.push(assistantMsg);
						await saveChatSidecar(sessionId, chatHistory);

						send("done", JSON.stringify({}));
					} catch (err) {
						send("chat_error", JSON.stringify({ message: err instanceof Error ? err.message : String(err) }));
					} finally {
						controller.close();
					}
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

		"GET /api/sessions/:id/cartoon": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[3]!;
			const cartoon = await loadCartoonSidecar(id);
			if (!cartoon) return json(null);
			return json(cartoon);
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
					await saveCartoonSidecar(sessionId, {
						imageBase64: result.imageBase64,
						mimeType: result.mimeType,
						generatedAt: new Date().toISOString(),
					});
				}

				return json(result);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},
		"GET /api/sessions/:id/slides": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[3]!;
			const deck = await loadSlidesSidecar(id);
			if (!deck) return json(null);
			return json(deck);
		},

		"POST /api/slides": async (req: Request) => {
			if (!config.openrouter_api_key) return json({ error: "OpenRouter API key required" }, 400);

			const body = await req.json() as { sessionId?: string; language?: string; resume?: boolean };
			const sessionId = body.sessionId;
			if (!sessionId) return json({ error: "Missing sessionId" }, 400);

			const data = await loadSession(sessionId);
			if (!data) return json({ error: "Session not found" }, 404);

			if (slideJobs.has(sessionId) && slideJobs.get(sessionId)!.status === "running") {
				return json({ status: "already_running" });
			}

			const existingDeck = body.resume ? await loadSlidesSidecar(sessionId) : null;
			const job: SlideJob = { status: "running", message: "Planning slide deck...", current: 0, total: 0 };
			slideJobs.set(sessionId, job);

			(async () => {
				try {
					const deck = await generateSlides(
						config.openrouter_api_key,
						data,
						config.model,
						body.language ?? config.language,
						(msg, current, total) => {
							job.message = msg;
							job.current = current;
							job.total = total;
						},
						existingDeck,
						(plan, prompts) => {
							job.plan = plan;
							job.imagePrompts = prompts;
						},
						(partialDeck) => {
							saveSlidesSidecar(sessionId, partialDeck).catch(() => {});
						},
					);
					await saveSlidesSidecar(sessionId, deck);
					job.status = "done";
					job.message = `Generated ${deck.slides.length} slides`;
					job.total = deck.slides.length;
					job.current = deck.slides.length;
				} catch (err) {
					job.status = "error";
					job.message = err instanceof Error ? err.message : String(err);
				}
			})();

			return json({ status: "started" });
		},

		"GET /api/slides/status": async (req: Request) => {
			const url = new URL(req.url);
			const sessionId = url.searchParams.get("sessionId");
			if (!sessionId) return json({ error: "Missing sessionId" }, 400);
			const job = slideJobs.get(sessionId);
			if (!job) return json({ status: "idle" });
			return json(job);
		},

		"GET /api/plugins": () => {
			const plugins = getAllPlugins().map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				icon: p.icon,
				tabLabel: p.tabLabel,
			}));
			return json(plugins);
		},

		"GET /api/plugins/:id/data": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const pluginId = segments[3]!;
			const sessionId = url.searchParams.get("sessionId");
			if (!sessionId) return json({ error: "Missing sessionId" }, 400);
			const plugin = getPlugin(pluginId);
			if (!plugin) return json({ error: `Unknown plugin: ${pluginId}` }, 404);
			const data = await plugin.load(sessionId);
			return json(data);
		},

		"POST /api/plugins/:id/generate": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const pluginId = segments[3]!;
			const body = await req.json() as { sessionId?: string; resume?: boolean };
			const sessionId = body.sessionId;
			if (!sessionId) return json({ error: "Missing sessionId" }, 400);
			if (!config.openrouter_api_key) return json({ error: "API key required" }, 400);

			const plugin = getPlugin(pluginId);
			if (!plugin) return json({ error: `Unknown plugin: ${pluginId}` }, 404);

			const data = await loadSession(sessionId);
			if (!data) return json({ error: "Session not found" }, 404);

			const jobKey = `${pluginId}:${sessionId}`;
			if (pluginJobs.has(jobKey) && pluginJobs.get(jobKey)!.status === "running") {
				return json({ status: "already_running" });
			}

			const job: PluginJob = { status: "running", message: "Starting...", current: 0, total: 0 };
			pluginJobs.set(jobKey, job);

			const existingData = body.resume ? await plugin.load(sessionId) : null;

			(async () => {
				try {
					const result = await plugin.generate(
						{ apiKey: config.openrouter_api_key, sessionId, data, language: config.language },
						(event) => { job.message = event.message; job.current = event.current; job.total = event.total; },
						existingData,
					);
					await plugin.save(sessionId, result.data);
					job.status = "done";
					job.message = "Complete";
				} catch (err) {
					job.status = "error";
					job.message = err instanceof Error ? err.message : String(err);
				}
			})();

			return json({ status: "started" });
		},

		"GET /api/plugins/:id/status": async (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const pluginId = segments[3]!;
			const sessionId = url.searchParams.get("sessionId");
			if (!sessionId) return json({ error: "Missing sessionId" }, 400);
			const job = pluginJobs.get(`${pluginId}:${sessionId}`);
			if (!job) return json({ status: "idle" });
			return json(job);
		},
	};
}
