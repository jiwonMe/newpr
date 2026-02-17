import { useState, useCallback, useRef } from "react";
import type { ProgressEvent } from "../../../analyzer/progress.ts";
import type { NewprOutput } from "../../../types/output.ts";

type Phase = "idle" | "loading" | "done" | "error";

interface AnalysisState {
	phase: Phase;
	sessionId: string | null;
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
		events: [],
		result: null,
		error: null,
		startedAt: null,
		lastPrInput: null,
	});
	const eventSourceRef = useRef<EventSource | null>(null);

	const start = useCallback(async (prInput: string) => {
		setState({
			phase: "loading",
			sessionId: null,
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
				const data = await resultRes.json();
				setState((s) => ({
					...s,
					phase: "done",
					result: data.result ?? null,
				}));
			});

			es.addEventListener("error", (e) => {
				es.close();
				eventSourceRef.current = null;
				const data = (e as MessageEvent).data;
				let msg = "Analysis failed";
				try { msg = JSON.parse(data).data ?? msg; } catch {}
				setState((s) => ({ ...s, phase: "error", error: msg }));
			});
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
			setState((s) => ({
				...s,
				phase: "done",
				result: data,
				sessionId,
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
			events: [],
			result: null,
			error: null,
			startedAt: null,
			lastPrInput: null,
		});
	}, []);

	return { ...state, start, loadStoredSession, reset };
}
