import { useAnalysis } from "./hooks/useAnalysis.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { useSessions } from "./hooks/useSessions.ts";
import { AppShell } from "./components/AppShell.tsx";
import { InputScreen } from "./components/InputScreen.tsx";
import { LoadingTimeline } from "./components/LoadingTimeline.tsx";
import { ResultsScreen } from "./components/ResultsScreen.tsx";
import { ErrorScreen } from "./components/ErrorScreen.tsx";

export function App() {
	const analysis = useAnalysis();
	const themeCtx = useTheme();
	const { sessions } = useSessions();

	function handleNewAnalysis() {
		analysis.reset();
	}

	return (
		<AppShell
			theme={themeCtx.theme}
			onThemeChange={themeCtx.setTheme}
			sessions={sessions}
			onSessionSelect={(id) => analysis.loadStoredSession(id)}
			onNewAnalysis={handleNewAnalysis}
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
				<ResultsScreen data={analysis.result} onBack={handleNewAnalysis} />
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
