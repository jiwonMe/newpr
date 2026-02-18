import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAnalysis } from "./hooks/useAnalysis.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { useSessions } from "./hooks/useSessions.ts";
import { useGithubUser } from "./hooks/useGithubUser.ts";
import { useFeatures } from "./hooks/useFeatures.ts";
import { useBackgroundAnalyses } from "./hooks/useBackgroundAnalyses.ts";
import { AppShell } from "./components/AppShell.tsx";
import { InputScreen } from "./components/InputScreen.tsx";
import { LoadingTimeline } from "./components/LoadingTimeline.tsx";
import { ResultsScreen } from "./components/ResultsScreen.tsx";
import { ErrorScreen } from "./components/ErrorScreen.tsx";
import { DetailPane, resolveDetail } from "./components/DetailPane.tsx";
import { useChatState, ChatProvider, ChatInput } from "./components/ChatSection.tsx";
import type { AnchorItem } from "./components/TipTapEditor.tsx";
import { requestNotificationPermission } from "./lib/notify.ts";
import { analytics } from "./lib/analytics.ts";

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
	const features = useFeatures();
	const bgAnalyses = useBackgroundAnalyses();
	const initialLoadDone = useRef(false);

	useEffect(() => { requestNotificationPermission(); }, []);
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

	const bgDoneCount = bgAnalyses.analyses.filter((a) => a.status === "done").length;
	const prevBgDoneCount = useRef(bgDoneCount);
	useEffect(() => {
		if (bgDoneCount > prevBgDoneCount.current) refreshSessions();
		prevBgDoneCount.current = bgDoneCount;
	}, [bgDoneCount, refreshSessions]);

	const scrollGuardRef = useRef<number | null>(null);
	const handleAnchorClick = useCallback((kind: "group" | "file" | "line", id: string) => {
		analytics.detailOpened(kind);
		const key = `${kind}:${id}`;
		const main = document.querySelector("main");
		const savedScroll = main?.scrollTop ?? 0;
		scrollGuardRef.current = savedScroll;
		setActiveId((prev) => prev === key ? null : key);
		const restore = () => { if (main && scrollGuardRef.current !== null) main.scrollTop = scrollGuardRef.current; };
		requestAnimationFrame(restore);
		setTimeout(restore, 50);
		setTimeout(() => { scrollGuardRef.current = null; }, 200);
	}, []);

	const detailTarget = useMemo(() => {
		if (!activeId || !analysis.result) return null;
		const [kind, ...rest] = activeId.split(":");
		const id = rest.join(":");
		return resolveDetail(kind as "group" | "file" | "line", id, analysis.result.groups, analysis.result.files);
	}, [activeId, analysis.result]);

	const moveToBackground = useCallback(() => {
		if (analysis.phase === "loading" && analysis.sessionId && analysis.lastPrInput) {
			bgAnalyses.track(analysis.sessionId, analysis.lastPrInput);
		}
	}, [analysis.phase, analysis.sessionId, analysis.lastPrInput, bgAnalyses]);

	function handleSessionSelect(id: string) {
		moveToBackground();
		setActiveId(null);
		analysis.loadStoredSession(id);
		setUrlParams({ session: id, tab: null });
	}

	function handleNewAnalysis() {
		moveToBackground();
		setActiveId(null);
		analysis.reset();
	}

	const handleBgClick = useCallback((sessionId: string) => {
		const bg = bgAnalyses.analyses.find((a) => a.sessionId === sessionId);
		if (!bg) return;
		if (bg.status === "done" && bg.historyId) {
			bgAnalyses.dismiss(sessionId);
			setActiveId(null);
			analysis.loadStoredSession(bg.historyId);
			setUrlParams({ session: bg.historyId, tab: null });
			refreshSessions();
		} else if (bg.status === "done" && bg.result) {
			bgAnalyses.dismiss(sessionId);
		} else if (bg.status === "error") {
			bgAnalyses.dismiss(sessionId);
		}
	}, [bgAnalyses, analysis, refreshSessions]);

	const diffSessionId = analysis.historyId ?? analysis.sessionId;
	const prUrl = analysis.result?.meta.pr_url;
	const detailPanel = detailTarget ? (
		<DetailPane target={detailTarget} sessionId={diffSessionId} prUrl={prUrl} onClose={() => setActiveId(null)} />
	) : null;

	const [activeTab, setActiveTab] = useState(() => getUrlParam("tab") ?? "story");
	const handleTabChange = useCallback((tab: string) => {
		analytics.tabChanged(tab);
		setActiveTab(tab);
	}, []);
	const chatState = useChatState(analysis.phase === "done" ? diffSessionId : null);

	const anchorItems = useMemo<AnchorItem[]>(() => {
		if (!analysis.result) return [];
		const items: AnchorItem[] = [];
		for (const g of analysis.result.groups) {
			items.push({ kind: "group", id: g.name, label: g.name });
		}
		for (const f of analysis.result.files) {
			items.push({ kind: "file", id: f.path, label: f.path });
		}
		return items;
	}, [analysis.result]);

	return (
		<ChatProvider state={chatState} anchorItems={anchorItems} analyzedAt={analysis.result?.meta.analyzed_at}>
		<AppShell
			theme={themeCtx.theme}
			onThemeChange={themeCtx.setTheme}
			sessions={sessions}
			githubUser={githubUser}
			onSessionSelect={handleSessionSelect}
			onNewAnalysis={handleNewAnalysis}
			detailPanel={detailPanel}
			bottomBar={analysis.phase === "done" && activeTab === "story" ? <ChatInput /> : undefined}
			activeSessionId={diffSessionId}
			version={features.version}
			bgAnalyses={bgAnalyses.analyses}
			onBgClick={handleBgClick}
			onBgDismiss={bgAnalyses.dismiss}
			onFeaturesChange={features.refresh}
		>
			{analysis.phase === "idle" && (
				<InputScreen
					onSubmit={(pr) => analysis.start(pr)}
					sessions={sessions}
					onSessionSelect={handleSessionSelect}
					version={features.version}
				/>
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
					cartoonEnabled={features.cartoon}
					sessionId={diffSessionId}
					onTabChange={handleTabChange}
					onReanalyze={(prUrl: string) => { analysis.start(prUrl); }}
					enabledPlugins={features.enabledPlugins}
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
		</ChatProvider>
	);
}
