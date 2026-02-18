import { useState, useCallback, useRef, useEffect } from "react";
import type { ProgressEvent } from "../../../analyzer/progress.ts";
import type { NewprOutput } from "../../../types/output.ts";
import { sendNotification } from "../lib/notify.ts";

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
	const restoredRef = useRef(false);

	useEffect(() => {
		if (restoredRef.current) return;
		restoredRef.current = true;
		fetch("/api/active-analyses")
			.then((r) => r.json())
			.then((data) => {
				const active = data as Array<{
					id: string;
					prInput: string;
					status: string;
					startedAt: number;
					prTitle?: string;
					prNumber?: number;
					lastStage?: string;
					lastMessage?: string;
				}>;
				for (const a of active) {
					if (!eventSourcesRef.current.has(a.id)) {
						trackInternal(a.id, a.prInput, a.prTitle, a.prNumber, a.lastMessage);
					}
				}
			})
			.catch(() => {});
	}, []);

	const trackInternal = useCallback((sessionId: string, prInput: string, initTitle?: string, initNumber?: number, initMessage?: string) => {
		if (eventSourcesRef.current.has(sessionId)) return;

		const entry: BackgroundAnalysis = {
			sessionId,
			prInput,
			status: "running",
			startedAt: Date.now(),
			prTitle: initTitle,
			prNumber: initNumber,
			lastMessage: initMessage,
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
				setAnalyses((prev) => {
					const a = prev.find((x) => x.sessionId === sessionId);
					sendNotification("Analysis complete", a?.prTitle ?? prInput);
					return prev.map((x) =>
						x.sessionId === sessionId
							? { ...x, status: "done" as const, result: data.result, historyId: data.historyId }
							: x,
					);
				});
			} catch {
				setAnalyses((prev) => {
					sendNotification("Analysis complete", prInput);
					return prev.map((a) =>
						a.sessionId === sessionId ? { ...a, status: "done" as const } : a,
					);
				});
			}
		});

		es.addEventListener("analysis_error", (e) => {
			es.close();
			eventSourcesRef.current.delete(sessionId);
			let msg = "Analysis failed";
			try { msg = JSON.parse((e as MessageEvent).data).message ?? msg; } catch {}
			sendNotification("Analysis failed", msg);
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

	const track = useCallback((sessionId: string, prInput: string) => {
		trackInternal(sessionId, prInput);
	}, [trackInternal]);

	return { analyses, track, dismiss };
}
