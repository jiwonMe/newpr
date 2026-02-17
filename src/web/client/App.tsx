import { useAnalysis } from "./hooks/useAnalysis.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { AppShell } from "./components/AppShell.tsx";
import { InputScreen } from "./components/InputScreen.tsx";
import { LoadingTimeline } from "./components/LoadingTimeline.tsx";
import { ResultsScreen } from "./components/ResultsScreen.tsx";

export function App() {
	const analysis = useAnalysis();
	const themeCtx = useTheme();

	return (
		<AppShell theme={themeCtx.theme} onThemeChange={themeCtx.setTheme}>
			{analysis.phase === "idle" && (
				<InputScreen onSubmit={analysis.start} />
			)}
			{analysis.phase === "loading" && (
				<LoadingTimeline
					events={analysis.events}
					startedAt={analysis.startedAt!}
				/>
			)}
			{analysis.phase === "done" && analysis.result && (
				<ResultsScreen data={analysis.result} onBack={analysis.reset} />
			)}
			{analysis.phase === "error" && (
				<div className="flex flex-col items-center justify-center gap-4 py-20">
					<div className="text-destructive font-medium">{analysis.error}</div>
					<button
						type="button"
						onClick={analysis.reset}
						className="text-sm text-muted-foreground hover:text-foreground underline"
					>
						Back
					</button>
				</div>
			)}
		</AppShell>
	);
}
