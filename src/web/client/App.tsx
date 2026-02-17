import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAnalysis } from "./hooks/useAnalysis.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { useSessions } from "./hooks/useSessions.ts";
import { useGithubUser } from "./hooks/useGithubUser.ts";
import { AppShell } from "./components/AppShell.tsx";
import { InputScreen } from "./components/InputScreen.tsx";
import { LoadingTimeline } from "./components/LoadingTimeline.tsx";
import { ResultsScreen } from "./components/ResultsScreen.tsx";
import { ErrorScreen } from "./components/ErrorScreen.tsx";
import { DetailPane, resolveDetail } from "./components/DetailPane.tsx";

function getUrlParam(key: string): string | null {
	return new URLSearchParams(window.location.search).get(key);
}

function setUrlParams(params: Record<string, string | null>) {
	const url = new URL(window.location.href);
	for (const [k, v] of Object.entries(params)) {
		if (v === null) {
			url.searchParams.delete(k);
		} else {
			url.searchParams.set(k, v);
		}
	}
	window.history.replaceState(null, "", url.toString());
}

export function App() {
	const analysis = useAnalysis();
	const themeCtx = useTheme();
	const { sessions, refresh: refreshSessions } = useSessions();
	const githubUser = useGithubUser();
	const initialLoadDone = useRef(false);
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (initialLoadDone.current) return;
		initialLoadDone.current = true;
		const sid = getUrlParam("session");
		if (sid) {
			analysis.loadStoredSession(sid);
		}
	}, []);

	useEffect(() => {
		if (analysis.phase === "done" && analysis.sessionId) {
			const url = new URL(window.location.href);
			url.searchParams.set("session", analysis.sessionId);
			window.history.replaceState(null, "", url.toString());
			refreshSessions();
		} else if (analysis.phase === "idle") {
			setUrlParams({ session: null, tab: null });
			setActiveId(null);
		}
	}, [analysis.phase, analysis.sessionId]);

	const handleAnchorClick = useCallback((kind: "group" | "file", id: string) => {
		const key = `${kind}:${id}`;
		setActiveId((prev) => prev === key ? null : key);
	}, []);

	const detailTarget = useMemo(() => {
		if (!activeId || !analysis.result) return null;
		const [kind, ...rest] = activeId.split(":");
		const id = rest.join(":");
		return resolveDetail(kind as "group" | "file", id, analysis.result.groups, analysis.result.files);
	}, [activeId, analysis.result]);

	function handleSessionSelect(id: string) {
		setActiveId(null);
		analysis.loadStoredSession(id);
		setUrlParams({ session: id, tab: null });
	}

	function handleNewAnalysis() {
		setActiveId(null);
		analysis.reset();
	}

	const detailPanel = detailTarget ? (
		<DetailPane target={detailTarget} onClose={() => setActiveId(null)} />
	) : null;

	return (
		<AppShell
			theme={themeCtx.theme}
			onThemeChange={themeCtx.setTheme}
			sessions={sessions}
			githubUser={githubUser}
			onSessionSelect={handleSessionSelect}
			onNewAnalysis={handleNewAnalysis}
			detailPanel={detailPanel}
		>
			{analysis.phase === "idle" && (
				<InputScreen onSubmit={(pr) => analysis.start(pr)} />
			)}
			{analysis.phase === "loading" && (
				<LoadingTimeline
					events={analysis.events}
					startedAt={analysis.startedAt!}
				/>
			)}
			{analysis.phase === "done" && analysis.result && (
				<ResultsScreen
					data={analysis.result}
					onBack={handleNewAnalysis}
					activeId={activeId}
					onAnchorClick={handleAnchorClick}
				/>
			)}
			{analysis.phase === "error" && (
				<ErrorScreen
					error={analysis.error ?? "An unknown error occurred"}
					onRetry={analysis.lastPrInput ? () => analysis.start(analysis.lastPrInput!) : undefined}
					onBack={handleNewAnalysis}
				/>
			)}
		</AppShell>
	);
}
