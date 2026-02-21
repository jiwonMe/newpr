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
import { chatWithTools, createLlmClient, type ChatTool, type ChatStreamEvent } from "../../llm/client.ts";
import { createResilientLlmClient } from "../../llm/resilient-client.ts";
import { detectAgents, runAgent } from "../../workspace/agent.ts";
import { randomBytes } from "node:crypto";
import { publishStack, buildStackPublishPreview } from "../../stack/publish.ts";
import { startStack, getStackState, cancelStack, subscribeStack, restoreCompletedStacks, setStackPublishResult, setStackPublishPreview, setStackPublishCleanupResult, recomputeStackPlanStatsIfNeeded } from "./stack-manager.ts";
import { getTelemetryConsent, setTelemetryConsent, telemetry } from "../../telemetry/index.ts";

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
	const SESSION_PR_STATE_TTL_MS = 90_000;
	const sessionPrStateCache = new Map<string, { state: string; checkedAt: number }>();

	function normalizePrState(data: { state?: string; draft?: boolean; merged?: boolean }): string {
		if (data.merged) return "merged";
		if (data.state === "closed") return "closed";
		if (data.draft) return "draft";
		return "open";
	}

	async function fetchPrState(prUrl: string): Promise<string | null> {
		if (!token) return null;
		try {
			const pr = parsePrInput(prUrl);
			const res = await fetch(`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, { headers: ghHeaders });
			if (!res.ok) return null;
			const data = await res.json() as { state?: string; draft?: boolean; merged?: boolean };
			return normalizePrState(data);
		} catch {
			return null;
		}
	}

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

	function buildFallbackPrompt(
		systemPrompt: string,
		chatHistory: ChatMessage[],
		patches?: Record<string, string> | null,
	): string {
		const parts: string[] = [systemPrompt];

		if (patches && Object.keys(patches).length > 0) {
			const patchSummary = Object.entries(patches)
				.map(([path, diff]) => `### ${path}\n\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\``)
				.join("\n\n");
			parts.push(`\n\n<file_diffs>\n${patchSummary}\n</file_diffs>`);
		}

		for (const msg of chatHistory) {
			if (msg.isCompactSummary) {
				parts.push(`\n[Conversation summary]: ${msg.content}`);
			} else if (msg.role === "user") {
				parts.push(`\nUser: ${msg.content}`);
			} else if (msg.role === "assistant") {
				parts.push(`\nAssistant: ${msg.content}`);
			}
		}

		return parts.join("\n");
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

## Commenting on GitHub
When the user asks you to leave a comment, post feedback, or write a review:
1. **Inline code comment** → use \`create_review_comment\` with file path + line number. Use this when the feedback is about a specific piece of code (a function, a line, a block).
2. **General discussion comment** → use \`create_discussion_comment\`. Use this for overall feedback, questions, design suggestions, or anything not tied to a specific code location.
3. **Approve / Request changes** → use \`submit_review\`.

ALWAYS use the appropriate tool to actually post the comment to GitHub. Do NOT just write the comment text in your response without calling the tool. When in doubt about whether feedback is code-specific or general, prefer \`create_review_comment\` if you can identify a relevant file and line, otherwise use \`create_discussion_comment\`.

Before posting an inline comment, ALWAYS call \`get_file_diff\` first to find the exact line numbers.

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
			{
				type: "function",
				function: {
					name: "create_review_comment",
					description: "Create an inline review comment on a specific line or line range of a file in this PR. The comment will be posted to GitHub. Use this when the user asks to leave a comment, suggestion, or feedback on specific code.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "File path (e.g. 'src/auth/session.ts')" },
							line: { type: "number", description: "Line number to comment on (end line if range)" },
							start_line: { type: "number", description: "Start line for multi-line comment (optional)" },
							body: { type: "string", description: "Comment body in markdown" },
						},
						required: ["path", "line", "body"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "create_discussion_comment",
					description: "Post a general comment on the PR discussion thread (not on a specific line of code). Use this for overall feedback, questions, or comments that aren't about a specific code location.",
					parameters: {
						type: "object",
						properties: {
							body: { type: "string", description: "Comment body in markdown" },
						},
						required: ["body"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "submit_review",
					description: "Submit a PR review with a verdict: APPROVE, REQUEST_CHANGES, or COMMENT. Use when the user asks to approve or request changes on the PR.",
					parameters: {
						type: "object",
						properties: {
							event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"], description: "Review action" },
							body: { type: "string", description: "Optional review summary message" },
						},
						required: ["event"],
					},
				},
			},
		];
	}

	return {
		"POST /api/analysis": async (req: Request) => {
			const body = await req.json() as { pr: string; reuseSessionId?: string };
			if (!body.pr) return json({ error: "Missing 'pr' field" }, 400);

			const result = startAnalysis(body.pr, token, config, body.reuseSessionId);
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
					let closed = false;
					const send = (eventType: string, data: string) => {
						if (closed) return;
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};
					const safeClose = () => {
						if (closed) return;
						closed = true;
						clearInterval(heartbeat);
						setTimeout(() => { try { controller.close(); } catch {} }, 50);
					};

					const heartbeat = setInterval(() => {
						if (closed) return;
						try { controller.enqueue(encoder.encode(":keepalive\n\n")); } catch { safeClose(); }
					}, 15_000);

					const unsubscribe = subscribe(id, (event) => {
						try {
							if ("type" in event && event.type === "done") {
								send("done", JSON.stringify({}));
								safeClose();
							} else if ("type" in event && event.type === "error") {
								send("analysis_error", JSON.stringify({ message: event.data ?? "Unknown error" }));
								safeClose();
							} else {
								send("progress", JSON.stringify(event));
							}
						} catch {
							safeClose();
						}
					});

					if (!unsubscribe) {
						send("analysis_error", JSON.stringify({ message: "Session not found" }));
						safeClose();
					}

					req.signal.addEventListener("abort", () => {
						unsubscribe?.();
						safeClose();
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

		"GET /api/sessions": async (req: Request) => {
			const url = new URL(req.url);
			const shouldRefreshState = url.searchParams.get("refresh") !== "0";
			const sessions = await listSessions(50);
			const now = Date.now();

			const hydrated = await Promise.all(sessions.map(async (session) => {
				const currentState = session.pr_state;
				if (currentState === "merged" || currentState === "closed") return session;
				if (!shouldRefreshState) return session;

				const cached = sessionPrStateCache.get(session.id);
				if (cached && now - cached.checkedAt < SESSION_PR_STATE_TTL_MS) {
					return { ...session, pr_state: cached.state };
				}

				const state = await fetchPrState(session.pr_url);
				if (!state) return session;

				sessionPrStateCache.set(session.id, { state, checkedAt: now });
				return { ...session, pr_state: state };
			}));

			return json(hydrated.filter((session) => session.pr_state !== "merged" && session.pr_state !== "closed"));
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

		"GET /api/models": async () => {
			if (!config.openrouter_api_key) return json([]);
			try {
				const res = await fetch("https://openrouter.ai/api/v1/models", {
					headers: { Authorization: `Bearer ${config.openrouter_api_key}` },
				});
				if (!res.ok) return json([]);
				const data = await res.json() as { data?: Array<{ id: string; name: string; created?: number; context_length?: number }> };
				const models = (data.data ?? [])
					.filter((m) => m.id && !m.id.includes(":free") && !m.id.includes(":extended"))
					.map((m) => ({
						id: m.id,
						name: m.name ?? m.id,
						provider: m.id.split("/")[0] ?? "",
						created: m.created ?? 0,
						contextLength: m.context_length,
					}))
					.sort((a, b) => {
						const provCmp = a.provider.localeCompare(b.provider);
						if (provCmp !== 0) return provCmp;
						return b.created - a.created;
					});
				return json(models);
			} catch {
				return json([]);
			}
		},

		"GET /api/config": async () => {
			const stored = await readStoredConfig();
			const pluginList = getAllPlugins().map((p) => ({ id: p.id, name: p.name }));
			const enabledPlugins = stored.enabled_plugins ?? pluginList.map((p) => p.id);
			const agents = await detectAgents();
			const telemetryConsent = await getTelemetryConsent();
		return json({
			model: config.model,
			agent: config.agent ?? null,
			language: config.language,
			max_files: config.max_files,
			timeout: config.timeout,
			concurrency: config.concurrency,
			has_api_key: !!config.openrouter_api_key,
			has_agent_fallback: agents.length > 0,
			has_github_token: !!token,
			enabled_plugins: enabledPlugins,
			available_plugins: pluginList,
			telemetry_consent: telemetryConsent,
			custom_prompt: config.custom_prompt ?? "",
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
				if (val === "claude" || val === "cursor" || val === "gemini" || val === "opencode" || val === "codex") {
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
			if ((body as Record<string, unknown>).custom_prompt !== undefined) {
				const val = (body as Record<string, unknown>).custom_prompt as string;
				update.custom_prompt = val || undefined;
				config.custom_prompt = val || undefined;
			}

			const telemetryConsentVal = (body as Record<string, unknown>).telemetry_consent as string | undefined;
			if (telemetryConsentVal === "granted" || telemetryConsentVal === "denied") {
				await setTelemetryConsent(telemetryConsentVal);
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

		"GET /api/update-check": async () => {
			const { checkForUpdate } = require("../../cli/update-check.ts") as typeof import("../../cli/update-check.ts");
			const { getVersion } = require("../../version.ts") as typeof import("../../version.ts");
			const current = getVersion();
			const info = await checkForUpdate(current);
			return json({ current, latest: info?.latest ?? current, needsUpdate: !!info?.needsUpdate });
		},

		"POST /api/update": async () => {
			try {
				const proc = Bun.spawn(["bun", "add", "-g", "newpr"], {
					cwd: "/tmp",
					stdout: "pipe",
					stderr: "pipe",
				});
				const exitCode = await proc.exited;
				const stdout = await new Response(proc.stdout).text();
				const stderr = await new Response(proc.stderr).text();
				if (exitCode !== 0) {
					return json({ ok: false, error: stderr.trim() || stdout.trim() }, 500);
				}

				setTimeout(() => {
					Bun.spawn(["newpr", ...process.argv.slice(2)], {
						cwd: process.cwd(),
						stdin: "inherit",
						stdout: "inherit",
						stderr: "inherit",
					});
					setTimeout(() => process.exit(0), 500);
				}, 1000);

				return json({ ok: true, restarting: true });
			} catch (err) {
				return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
			}
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
				telemetry.reviewSubmitted(body.event);
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
					let closed = false;
					const send = (eventType: string, data: string) => {
						if (closed) return;
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};
					const safeClose = () => {
						if (closed) return;
						closed = true;
						clearInterval(heartbeat);
						setTimeout(() => { try { controller.close(); } catch {} }, 50);
					};
					const heartbeat = setInterval(() => {
						if (closed) return;
						try { controller.enqueue(encoder.encode(":keepalive\n\n")); } catch { safeClose(); }
					}, 15_000);

					try {
						if (config.openrouter_api_key) {
							await chatWithTools(
								{ api_key: config.openrouter_api_key, model: config.model, timeout: config.timeout },
								apiMessages as Parameters<typeof chatWithTools>[1],
								buildChatTools(),
								async (name: string, args: Record<string, unknown>): Promise<string> => {
									if (name === "get_file_diff") {
										const filePath = args.path as string;
										if (!filePath) return "Error: path required";
										const inlinePatches = await loadPatchesSidecar(sessionId);
										if (inlinePatches?.[filePath]) return inlinePatches[filePath];
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
						} else {
							const llm = createLlmClient({ api_key: "", model: config.model, timeout: config.timeout });
							const inlinePatches = await loadPatchesSidecar(sessionId);
							const fallbackPrompt = buildFallbackPrompt(systemPrompt, [{ role: "user", content: body.message.trim(), timestamp: new Date().toISOString() }], inlinePatches);
							await llm.completeStream(
								"You are a helpful PR review assistant. Answer based on the provided context.",
								fallbackPrompt,
								(chunk: string) => {
									send("text", JSON.stringify({ content: chunk }));
								},
							);
						}
						send("done", JSON.stringify({}));
					} catch (err) {
						send("chat_error", JSON.stringify({ message: err instanceof Error ? err.message : String(err) }));
					} finally {
						safeClose();
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

			const body = await req.json() as { message: string };
			if (!body.message?.trim()) return json({ error: "Missing message" }, 400);

			const sessionData = await loadSession(sessionId);
			if (!sessionData) return json({ error: "Session not found" }, 404);

			let chatHistory = await loadChatSidecar(sessionId) ?? [];

			const COMPACT_THRESHOLD = 60;
			const PROTECT_RECENT = 6;

			if (chatHistory.length > COMPACT_THRESHOLD) {
				const toCompact = chatHistory.slice(0, chatHistory.length - PROTECT_RECENT);
				const recentMessages = chatHistory.slice(chatHistory.length - PROTECT_RECENT);

				const summaryLines: string[] = [];
				for (const msg of toCompact) {
					if (msg.isCompactSummary) {
						summaryLines.push(`[Previous summary]: ${msg.content.slice(0, 500)}`);
						continue;
					}
					if (msg.role === "user") {
						summaryLines.push(`User: ${msg.content.slice(0, 200)}`);
					} else if (msg.role === "assistant") {
						const toolNames = msg.toolCalls?.map((tc) => tc.name).join(", ");
						const preview = msg.content.slice(0, 200);
						summaryLines.push(`Assistant: ${preview}${toolNames ? ` [tools: ${toolNames}]` : ""}`);
					}
				}

				try {
					const compactPrompt = `Summarize the following conversation concisely for continuation. Focus on: what was discussed, key decisions made, actions taken (tool calls and their outcomes), and any unresolved topics. Be thorough but concise.\n\n${summaryLines.join("\n")}`;
					const llm = createLlmClient({ api_key: config.openrouter_api_key, model: config.model, timeout: config.timeout });
					const result = await llm.complete("You are a conversation summarizer. Output a concise summary.", compactPrompt);

					const compactMsg: ChatMessage = {
						role: "assistant",
						content: result.content,
						timestamp: new Date().toISOString(),
						isCompactSummary: true,
						compactedCount: toCompact.length,
					};

					chatHistory = [compactMsg, ...recentMessages];
					await saveChatSidecar(sessionId, chatHistory);
				} catch {}
			}

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
					case "create_review_comment": {
						const filePath = args.path as string;
						const line = args.line as number;
						const startLine = args.start_line as number | undefined;
						const body = args.body as string;
						if (!filePath || !line || !body) return "Error: path, line, and body are required";
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const sha = await fetchHeadSha(pr);
							if (!sha) return "Error: could not determine HEAD SHA";
							const ghBody: Record<string, unknown> = {
								commit_id: sha,
								path: filePath,
								line,
								side: "RIGHT",
								body,
							};
							if (startLine && startLine !== line) {
								ghBody.start_line = startLine;
								ghBody.start_side = "RIGHT";
							}
							const res = await fetch(
								`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments`,
								{ method: "POST", headers: ghHeaders, body: JSON.stringify(ghBody) },
							);
							if (!res.ok) {
								const errBody = await res.text();
								return `GitHub API error ${res.status}: ${errBody.slice(0, 200)}`;
							}
							const data = await res.json() as { id?: number; html_url?: string };
							return `Comment created on ${filePath}:${startLine && startLine !== line ? `${startLine}-` : ""}${line}. ${data.html_url ?? ""}`;
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "create_discussion_comment": {
						const body = args.body as string;
						if (!body) return "Error: body is required";
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const res = await fetch(
								`https://api.github.com/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`,
								{ method: "POST", headers: ghHeaders, body: JSON.stringify({ body }) },
							);
							if (!res.ok) {
								const errBody = await res.text();
								return `GitHub API error ${res.status}: ${errBody.slice(0, 200)}`;
							}
							const data = await res.json() as { id?: number; html_url?: string };
							return `Discussion comment posted. ${data.html_url ?? ""}`;
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					case "submit_review": {
						const event = args.event as string;
						const body = (args.body as string) ?? "";
						if (!event || !["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(event)) {
							return "Error: event must be APPROVE, REQUEST_CHANGES, or COMMENT";
						}
						try {
							const pr = parsePrInput(sessionData.meta.pr_url);
							const res = await fetch(
								`https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
								{
									method: "POST",
									headers: ghHeaders,
									body: JSON.stringify({ body, event }),
								},
							);
							if (!res.ok) {
								const errBody = await res.text();
								return `GitHub API error ${res.status}: ${errBody.slice(0, 200)}`;
							}
							const data = await res.json() as { html_url?: string; state?: string };
							return `Review submitted: ${data.state ?? event}. ${data.html_url ?? ""}`;
						} catch (err) {
							return `Error: ${err instanceof Error ? err.message : String(err)}`;
						}
					}
					default:
						return `Unknown tool: ${name}`;
				}
			};

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				async start(controller) {
					let closed = false;
					const send = (eventType: string, data: string) => {
						if (closed) return;
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};
					const safeClose = () => {
						if (closed) return;
						closed = true;
						clearInterval(heartbeat);
						setTimeout(() => { try { controller.close(); } catch {} }, 50);
					};
					const heartbeat = setInterval(() => {
						if (closed) return;
						try { controller.enqueue(encoder.encode(":keepalive\n\n")); } catch { safeClose(); }
					}, 15_000);

					let fullText = "";
					const collectedToolCalls: ChatToolCall[] = [];
					const orderedSegments: ChatSegment[] = [];
					let lastSegmentWasText = false;

					try {
						if (config.openrouter_api_key) {
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
						} else {
							const llm = createLlmClient({ api_key: "", model: config.model, timeout: config.timeout });
							const prompt = buildFallbackPrompt(
								systemPrompt,
								chatHistory,
								patches,
							);
							const result = await llm.completeStream(
								"You are a helpful PR review assistant. Answer based on the provided context.",
								prompt,
								(chunk: string) => {
									fullText += chunk;
									send("text", JSON.stringify({ content: chunk }));
								},
							);
							fullText = result.content;
							orderedSegments.push({ type: "text", content: fullText });
						}

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
						safeClose();
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
			const apiKey = config.openrouter_api_key;
			if (!apiKey) return json({ error: "OpenRouter API key required" }, 400);

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
						apiKey,
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
			const apiKey = config.openrouter_api_key;
			if (!apiKey) return json({ error: "API key required" }, 400);

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
						{ apiKey, sessionId, data, language: config.language },
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

		"POST /api/stack/start": async (req: Request) => {
			try {
				const body = await req.json() as { sessionId: string; maxGroups?: number; envVars?: Record<string, string> };
				if (!body.sessionId) return json({ error: "Missing sessionId" }, 400);
				const customEnv = body.envVars && Object.keys(body.envVars).length > 0 ? body.envVars : null;
				const result = startStack(body.sessionId, body.maxGroups ?? null, token, config, customEnv);
				if ("error" in result) return json({ error: result.error }, result.status);
				return json({ ok: true });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},

		"GET /api/stack/:id": async (req: Request) => {
			const url = new URL(req.url);
			const id = url.pathname.split("/").pop()!;
			let state = getStackState(id);
			if (!state) {
				await restoreCompletedStacks([id]);
				state = getStackState(id);
			}
			if (state?.plan && state.context) {
				await recomputeStackPlanStatsIfNeeded(id);
				state = getStackState(id);
			}
			if (!state) return json({ state: null });
			return json({ state });
		},

		"POST /api/stack/:id/cancel": (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;
			const ok = cancelStack(id);
			return json({ ok });
		},

		"GET /api/stack/:id/events": (req: Request) => {
			const url = new URL(req.url);
			const segments = url.pathname.split("/");
			const id = segments[segments.length - 2]!;

			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					let closed = false;
					const send = (eventType: string, data: string) => {
						if (closed) return;
						controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${data}\n\n`));
					};
					const safeClose = () => {
						if (closed) return;
						closed = true;
						clearInterval(heartbeat);
						setTimeout(() => { try { controller.close(); } catch {} }, 50);
					};

					const heartbeat = setInterval(() => {
						if (closed) return;
						try { controller.enqueue(encoder.encode(":keepalive\n\n")); } catch { safeClose(); }
					}, 15_000);

					const unsubscribe = subscribeStack(id, (event) => {
						try {
							if ("type" in event && event.type === "done") {
								send("done", JSON.stringify({ state: getStackState(id) }));
								safeClose();
							} else if ("type" in event && event.type === "error") {
								send("stack_error", JSON.stringify({ message: event.data ?? "Unknown error", state: getStackState(id) }));
								safeClose();
							} else {
								send("progress", JSON.stringify({ ...event, state: getStackState(id) }));
							}
						} catch {
							safeClose();
						}
					});

					if (!unsubscribe) {
						const existingState = getStackState(id);
						if (existingState) {
							send("done", JSON.stringify({ state: existingState }));
						} else {
							send("stack_error", JSON.stringify({ message: "No stack session found" }));
						}
						safeClose();
					}

					req.signal.addEventListener("abort", () => {
						unsubscribe?.();
						safeClose();
					});
				},
			});

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			});
		},

		"POST /api/stack/publish": async (req: Request) => {
			try {
				const body = await req.json() as { sessionId: string };
				if (!body.sessionId) return json({ error: "Missing sessionId" }, 400);

				let state = getStackState(body.sessionId);
				if (!state) {
					await restoreCompletedStacks([body.sessionId]);
					state = getStackState(body.sessionId);
				}
				if (!state) return json({ error: "No stack state found" }, 404);
				if (!state.execResult) return json({ error: "Stack not executed yet" }, 400);
				if (!state.context) return json({ error: "Missing context" }, 400);

				const stored = await loadSession(body.sessionId);
				if (!stored) return json({ error: "Session not found" }, 404);
				const llmClient = createResilientLlmClient(
					{ api_key: config.openrouter_api_key, model: config.model, timeout: config.timeout },
					{ preferredAgent: config.agent },
				);

				const result = await publishStack({
					repo_path: state.context.repo_path,
					exec_result: state.execResult,
					pr_meta: stored.meta,
					base_branch: state.context.base_branch,
					owner: state.context.owner,
					repo: state.context.repo,
					plan_groups: state.plan?.groups?.map((g) => ({
						id: g.id,
						name: g.name,
						description: g.description,
						files: g.files,
						order: g.order,
						type: g.type,
						pr_title: g.pr_title,
						deps: g.deps,
					})),
					llm_client: llmClient,
					language: config.language,
					publish_preview: state.publishPreview,
				});
				await setStackPublishResult(body.sessionId, result);
				telemetry.stackPublished(result.prs.length);

				return json({ publish_result: result, state: getStackState(body.sessionId) });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},

		"POST /api/stack/publish/cleanup": async (req: Request) => {
			try {
				const body = await req.json() as { sessionId: string; mode?: "close" | "delete" };
				if (!body.sessionId) return json({ error: "Missing sessionId" }, 400);
				const mode = body.mode === "delete" ? "delete" : "close";

				let state = getStackState(body.sessionId);
				if (!state) {
					await restoreCompletedStacks([body.sessionId]);
					state = getStackState(body.sessionId);
				}
				if (!state) return json({ error: "No stack state found" }, 404);
				if (!state.context) return json({ error: "Missing context" }, 400);
				if (!state.publishResult?.prs?.length) return json({ error: "No published stack PRs found" }, 400);

				const ghRepo = `${state.context.owner}/${state.context.repo}`;
				const items: Array<{
					group_id: string;
					number: number;
					head_branch: string;
					closed: boolean;
					branch_deleted: boolean;
					message?: string;
				}> = [];

				for (const pr of state.publishResult.prs) {
					let closed = false;
					let branchDeleted = false;
					const notes: string[] = [];

					if (pr.number > 0) {
						const closeResult = await Bun.$`gh api repos/${ghRepo}/pulls/${pr.number} -X PATCH -f state=closed`.quiet().nothrow();
						if (closeResult.exitCode === 0) {
							closed = true;
						} else {
							const viewResult = await Bun.$`gh pr view ${pr.number} --repo ${ghRepo} --json state`.quiet().nothrow();
							if (viewResult.exitCode === 0) {
								try {
									const payload = JSON.parse(viewResult.stdout.toString()) as { state?: string };
									closed = payload.state === "CLOSED" || payload.state === "MERGED";
								} catch {}
							}
							if (!closed) {
								const stderr = closeResult.stderr.toString().trim();
								notes.push(stderr || "failed to close PR");
							}
						}
					} else {
						notes.push("missing PR number");
					}

					if (mode === "delete") {
						const deleteResult = await Bun.$`git -C ${state.context.repo_path} push origin :${pr.head_branch}`.quiet().nothrow();
						if (deleteResult.exitCode === 0) {
							branchDeleted = true;
						} else {
							const stderr = deleteResult.stderr.toString().trim();
							if (/remote ref does not exist|cannot lock ref|unable to delete/i.test(stderr)) {
								branchDeleted = true;
							} else {
								notes.push(stderr || "failed to delete branch");
							}
						}
					}

					items.push({
						group_id: pr.group_id,
						number: pr.number,
						head_branch: pr.head_branch,
						closed,
						branch_deleted: branchDeleted,
						message: notes.length > 0 ? notes.join(" | ") : undefined,
					});
				}

				const cleanupResult: {
					mode: "close" | "delete";
					completedAt: number;
					items: Array<{
						group_id: string;
						number: number;
						head_branch: string;
						closed: boolean;
						branch_deleted: boolean;
						message?: string;
					}>;
				} = {
					mode,
					completedAt: Date.now(),
					items,
				};

				await setStackPublishCleanupResult(body.sessionId, cleanupResult);
				return json({ cleanup_result: cleanupResult, state: getStackState(body.sessionId) });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},

		"POST /api/stack/publish/preview": async (req: Request) => {
			try {
				const body = await req.json() as { sessionId: string };
				if (!body.sessionId) return json({ error: "Missing sessionId" }, 400);

				let state = getStackState(body.sessionId);
				if (!state) {
					await restoreCompletedStacks([body.sessionId]);
					state = getStackState(body.sessionId);
				}
				if (!state) return json({ error: "No stack state found" }, 404);
				if (!state.execResult) return json({ error: "Stack not executed yet" }, 400);
				if (!state.context) return json({ error: "Missing context" }, 400);

				const stored = await loadSession(body.sessionId);
				if (!stored) return json({ error: "Session not found" }, 404);
				const llmClient = createResilientLlmClient(
					{ api_key: config.openrouter_api_key, model: config.model, timeout: config.timeout },
					{ preferredAgent: config.agent },
				);

				const preview = await buildStackPublishPreview({
					repo_path: state.context.repo_path,
					exec_result: state.execResult,
					pr_meta: stored.meta,
					base_branch: state.context.base_branch,
					owner: state.context.owner,
					repo: state.context.repo,
					plan_groups: state.plan?.groups?.map((g) => ({
						id: g.id,
						name: g.name,
						description: g.description,
						files: g.files,
						order: g.order,
						type: g.type,
						pr_title: g.pr_title,
						deps: g.deps,
					})),
					llm_client: llmClient,
					language: config.language,
				});
				await setStackPublishPreview(body.sessionId, preview);

				return json({ preview, state: getStackState(body.sessionId) });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return json({ error: msg }, 500);
			}
		},
	};
}
