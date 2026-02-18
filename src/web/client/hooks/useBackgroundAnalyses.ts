import { useState, useCallback, useRef, useEffect } from "react";
import type { ProgressEvent } from "../../../analyzer/progress.ts";
import type { NewprOutput } from "../../../types/output.ts";

export type BgStatus = "running" | "done" | "error";

export interface BackgroundAnalysis {
	sessionId: string;
	prInput: string;
	prTitle?: string;
	prNumber?: number;
	status: BgStatus;
	startedAt: number;
	lastStage?: string;
	lastMessage?: string;
	result?: NewprOutput;
	historyId?: string;
	error?: string;
}

export function useBackgroundAnalyses() {
	const [analyses, setAnalyses] = useState<BackgroundAnalysis[]>([]);
	const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

	const track = useCallback((sessionId: string, prInput: string) => {
		if (eventSourcesRef.current.has(sessionId)) return;

		const entry: BackgroundAnalysis = {
			sessionId,
			prInput,
			status: "running",
			startedAt: Date.now(),
		};

		setAnalyses((prev) => [...prev.filter((a) => a.sessionId !== sessionId), entry]);

		const es = new EventSource(`/api/analysis/${sessionId}/events`);
		eventSourcesRef.current.set(sessionId, es);

		es.addEventListener("progress", (e) => {
			const event = JSON.parse(e.data) as ProgressEvent;
			setAnalyses((prev) =>
				prev.map((a) =>
					a.sessionId === sessionId
						? {
								...a,
								lastStage: event.stage,
								lastMessage: event.message,
								prTitle: event.pr_title ?? a.prTitle,
								prNumber: event.pr_number ?? a.prNumber,
							}
						: a,
				),
			);
		});

		es.addEventListener("done", async () => {
			es.close();
			eventSourcesRef.current.delete(sessionId);
			try {
				const res = await fetch(`/api/analysis/${sessionId}`);
				const data = (await res.json()) as { result?: NewprOutput; historyId?: string };
				setAnalyses((prev) =>
					prev.map((a) =>
						a.sessionId === sessionId
							? { ...a, status: "done", result: data.result, historyId: data.historyId }
							: a,
					),
				);
			} catch {
				setAnalyses((prev) =>
					prev.map((a) =>
						a.sessionId === sessionId ? { ...a, status: "done" } : a,
					),
				);
			}
		});

		es.addEventListener("analysis_error", (e) => {
			es.close();
			eventSourcesRef.current.delete(sessionId);
			let msg = "Analysis failed";
			try { msg = JSON.parse((e as MessageEvent).data).message ?? msg; } catch {}
			setAnalyses((prev) =>
				prev.map((a) =>
					a.sessionId === sessionId ? { ...a, status: "error", error: msg } : a,
				),
			);
		});

		es.onerror = () => {
			if (es.readyState === EventSource.CLOSED) {
				eventSourcesRef.current.delete(sessionId);
			}
		};
	}, []);

	const dismiss = useCallback((sessionId: string) => {
		const es = eventSourcesRef.current.get(sessionId);
		if (es) {
			es.close();
			eventSourcesRef.current.delete(sessionId);
		}
		setAnalyses((prev) => prev.filter((a) => a.sessionId !== sessionId));
	}, []);

	useEffect(() => {
		return () => {
			for (const es of eventSourcesRef.current.values()) es.close();
		};
	}, []);

	return { analyses, track, dismiss };
}
