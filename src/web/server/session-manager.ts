import type { NewprConfig } from "../../types/config.ts";
import type { NewprOutput } from "../../types/output.ts";
import type { ProgressEvent } from "../../analyzer/progress.ts";
import { analyzePr } from "../../analyzer/pipeline.ts";
import { parsePrInput } from "../../github/parse-pr.ts";
import { saveSession, savePatchesSidecar, loadSession, loadChatSidecar, saveChatSidecar } from "../../history/store.ts";
import { telemetry } from "../../telemetry/index.ts";

type SessionStatus = "running" | "done" | "error" | "canceled";

interface AnalysisSession {
	id: string;
	prInput: string;
	status: SessionStatus;
	events: ProgressEvent[];
	result?: NewprOutput;
	historyId?: string;
	reuseSessionId?: string;
	error?: string;
	startedAt: number;
	finishedAt?: number;
	prTitle?: string;
	prNumber?: number;
	abortController: AbortController;
	subscribers: Set<(event: ProgressEvent | { type: "done" | "error"; data?: string }) => void>;
}

const sessions = new Map<string, AnalysisSession>();
const MAX_CONCURRENT = 4;

function generateId(): string {
	return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function runningCount(): number {
	let count = 0;
	for (const s of sessions.values()) {
		if (s.status === "running") count++;
	}
	return count;
}

export function getSession(id: string): AnalysisSession | undefined {
	return sessions.get(id);
}

export function startAnalysis(
	prInput: string,
	token: string,
	config: NewprConfig,
	reuseSessionId?: string,
): { sessionId: string } | { error: string; status: number } {
	if (runningCount() >= MAX_CONCURRENT) {
		return { error: "Too many concurrent analyses. Try again later.", status: 429 };
	}

	const id = generateId();
	const abortController = new AbortController();

	const session: AnalysisSession = {
		id,
		prInput,
		reuseSessionId,
		status: "running",
		events: [],
		startedAt: Date.now(),
		abortController,
		subscribers: new Set(),
	};
	sessions.set(id, session);

	telemetry.analysisStarted(0);
	runPipeline(session, prInput, token, config);

	return { sessionId: id };
}

async function runPipeline(
	session: AnalysisSession,
	prInput: string,
	token: string,
	config: NewprConfig,
): Promise<void> {
	try {
		const pr = parsePrInput(prInput);
		let capturedPatches: Record<string, string> = {};
		const result = await analyzePr({
			pr,
			token,
			config,
			preferredAgent: config.agent,
			onFilePatches: (patches) => { capturedPatches = patches; },
			onProgress: (event: ProgressEvent) => {
				const stamped = { ...event, timestamp: event.timestamp ?? Date.now() };
				session.events.push(stamped);
				if (event.pr_title) session.prTitle = event.pr_title;
				if (event.pr_number) session.prNumber = event.pr_number;
				for (const sub of session.subscribers) {
					sub(stamped);
				}
			},
		});

		session.status = "done";
		session.result = result;
		session.finishedAt = Date.now();

		const durationSec = Math.round((session.finishedAt - session.startedAt) / 1000);
		telemetry.analysisCompleted(result.files?.length ?? 0, durationSec);

		for (const sub of session.subscribers) {
			sub({ type: "done" });
		}
		session.subscribers.clear();

		const record = await saveSession(result).catch(() => null);
		if (record) {
			session.historyId = record.id;
			if (Object.keys(capturedPatches).length > 0) {
				await savePatchesSidecar(record.id, capturedPatches).catch(() => {});
			}
			if (session.reuseSessionId) {
				const prior = await loadSession(session.reuseSessionId).catch(() => null);
				if (prior?.meta.pr_url === result.meta.pr_url) {
					const priorChat = await loadChatSidecar(session.reuseSessionId).catch(() => null);
					if (priorChat && priorChat.length > 0) {
						await saveChatSidecar(record.id, priorChat).catch(() => {});
					}
				}
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		session.status = "error";
		session.error = msg;
		session.finishedAt = Date.now();

		telemetry.analysisError(msg);

		for (const sub of session.subscribers) {
			sub({ type: "error", data: msg });
		}
		session.subscribers.clear();
	}
}

export function cancelAnalysis(id: string): boolean {
	const session = sessions.get(id);
	if (!session || session.status !== "running") return false;
	session.abortController.abort();
	session.status = "canceled";
	session.finishedAt = Date.now();
	session.subscribers.clear();
	return true;
}

export function listActiveSessions(): Array<{
	id: string;
	prInput: string;
	status: SessionStatus;
	startedAt: number;
	prTitle?: string;
	prNumber?: number;
	lastStage?: string;
	lastMessage?: string;
}> {
	const result: ReturnType<typeof listActiveSessions> = [];
	for (const s of sessions.values()) {
		if (s.status !== "running") continue;
		const lastEvent = s.events[s.events.length - 1];
		result.push({
			id: s.id,
			prInput: s.prInput,
			status: s.status,
			startedAt: s.startedAt,
			prTitle: s.prTitle,
			prNumber: s.prNumber,
			lastStage: lastEvent?.stage,
			lastMessage: lastEvent?.message,
		});
	}
	return result;
}

export function subscribe(
	id: string,
	callback: (event: ProgressEvent | { type: "done" | "error"; data?: string }) => void,
): (() => void) | null {
	const session = sessions.get(id);
	if (!session) return null;

	for (const past of session.events) {
		callback(past);
	}

	if (session.status === "done") {
		callback({ type: "done" });
		return () => {};
	}
	if (session.status === "error") {
		callback({ type: "error", data: session.error });
		return () => {};
	}

	session.subscribers.add(callback);
	return () => {
		session.subscribers.delete(callback);
	};
}
