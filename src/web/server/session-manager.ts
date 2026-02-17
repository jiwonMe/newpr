import type { NewprConfig } from "../../types/config.ts";
import type { NewprOutput } from "../../types/output.ts";
import type { ProgressEvent } from "../../analyzer/progress.ts";
import { analyzePr } from "../../analyzer/pipeline.ts";
import { parsePrInput } from "../../github/parse-pr.ts";
import { saveSession } from "../../history/store.ts";

type SessionStatus = "running" | "done" | "error" | "canceled";

interface AnalysisSession {
	id: string;
	status: SessionStatus;
	events: ProgressEvent[];
	result?: NewprOutput;
	error?: string;
	startedAt: number;
	finishedAt?: number;
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
): { sessionId: string } | { error: string; status: number } {
	if (runningCount() >= MAX_CONCURRENT) {
		return { error: "Too many concurrent analyses. Try again later.", status: 429 };
	}

	const id = generateId();
	const abortController = new AbortController();

	const session: AnalysisSession = {
		id,
		status: "running",
		events: [],
		startedAt: Date.now(),
		abortController,
		subscribers: new Set(),
	};
	sessions.set(id, session);

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
		const result = await analyzePr({
			pr,
			token,
			config,
			preferredAgent: config.agent,
			onProgress: (event: ProgressEvent) => {
				const stamped = { ...event, timestamp: event.timestamp ?? Date.now() };
				session.events.push(stamped);
				for (const sub of session.subscribers) {
					sub(stamped);
				}
			},
		});

		session.status = "done";
		session.result = result;
		session.finishedAt = Date.now();

		for (const sub of session.subscribers) {
			sub({ type: "done" });
		}
		session.subscribers.clear();

		await saveSession(result).catch(() => {});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		session.status = "error";
		session.error = msg;
		session.finishedAt = Date.now();

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
