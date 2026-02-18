import { useState, useCallback, useRef } from "react";
import type { ProgressEvent } from "../../../analyzer/progress.ts";
import type { NewprOutput } from "../../../types/output.ts";
import { analytics } from "../lib/analytics.ts";

type Phase = "idle" | "loading" | "done" | "error";

interface AnalysisState {
	phase: Phase;
	sessionId: string | null;
	historyId: string | null;
	events: ProgressEvent[];
	result: NewprOutput | null;
	error: string | null;
	startedAt: number | null;
	lastPrInput: string | null;
}

export function useAnalysis() {
	const [state, setState] = useState<AnalysisState>({
		phase: "idle",
		sessionId: null,
		historyId: null,
		events: [],
		result: null,
		error: null,
		startedAt: null,
		lastPrInput: null,
	});
	const eventSourceRef = useRef<EventSource | null>(null);

	const start = useCallback(async (prInput: string) => {
		analytics.analysisStarted(0);
		setState({
			phase: "loading",
			sessionId: null,
			historyId: null,
			events: [],
			result: null,
			error: null,
			startedAt: Date.now(),
			lastPrInput: prInput,
		});

		try {
			const res = await fetch("/api/analysis", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pr: prInput }),
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? "Failed to start analysis");

			const { sessionId, eventsUrl } = body as { sessionId: string; eventsUrl: string };
			setState((s) => ({ ...s, sessionId }));

			const es = new EventSource(eventsUrl);
			eventSourceRef.current = es;

			es.addEventListener("progress", (e) => {
				const event = JSON.parse(e.data) as ProgressEvent;
				setState((s) => {
					const events = [...s.events];
					const lastIdx = events.length - 1;
					if (
						lastIdx >= 0 &&
						events[lastIdx]!.stage === event.stage &&
						event.partial_content &&
						events[lastIdx]!.partial_content
					) {
						events[lastIdx] = event;
					} else {
						events.push(event);
					}
					return { ...s, events };
				});
			});

			es.addEventListener("done", async () => {
				es.close();
				eventSourceRef.current = null;
				const resultRes = await fetch(`/api/analysis/${sessionId}`);
				const data = await resultRes.json() as { result?: NewprOutput; historyId?: string };
				setState((s) => {
					const durationSec = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0;
					analytics.analysisCompleted(data.result?.files.length ?? 0, durationSec);
					return {
						...s,
						phase: "done",
						result: data.result ?? null,
						historyId: data.historyId ?? null,
					};
				});
			});

			es.addEventListener("analysis_error", (e) => {
				es.close();
				eventSourceRef.current = null;
				let msg = "Analysis failed";
				try { msg = JSON.parse((e as MessageEvent).data).message ?? msg; } catch {}
				analytics.analysisError(msg.slice(0, 100));
				setState((s) => ({ ...s, phase: "error", error: msg }));
			});

			es.onerror = () => {
				if (es.readyState === EventSource.CLOSED) {
					eventSourceRef.current = null;
				}
			};
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, []);

	const loadStoredSession = useCallback(async (sessionId: string) => {
		setState((s) => ({
			...s,
			phase: "loading",
			historyId: null,
			events: [],
			result: null,
			error: null,
			startedAt: Date.now(),
			lastPrInput: null,
		}));

		try {
			const res = await fetch(`/api/sessions/${sessionId}`);
			if (!res.ok) throw new Error("Session not found");
			const data = await res.json() as NewprOutput;
			analytics.sessionLoaded();
			setState((s) => ({
				...s,
				phase: "done",
				result: data,
				sessionId,
				historyId: sessionId,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, []);

	const reset = useCallback(() => {
		eventSourceRef.current?.close();
		eventSourceRef.current = null;
		setState({
			phase: "idle",
			sessionId: null,
			historyId: null,
			events: [],
			result: null,
			error: null,
			startedAt: null,
			lastPrInput: null,
		});
	}, []);

	return { ...state, start, loadStoredSession, reset };
}
