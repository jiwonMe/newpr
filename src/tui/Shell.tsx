import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { NewprOutput } from "../types/output.ts";
import type { NewprConfig } from "../types/config.ts";
import type { ProgressEvent } from "../analyzer/progress.ts";
import type { SessionRecord } from "../history/types.ts";
import { parsePrInput } from "../github/parse-pr.ts";
import { analyzePr } from "../analyzer/pipeline.ts";
import { saveSession, listSessions, loadSession } from "../history/store.ts";
import { App } from "./App.tsx";
import { InputBar } from "./InputBar.tsx";
import { LoadingTimeline, buildStepLog, type StepLog } from "./Loading.tsx";
import { T, RISK_COLORS } from "./theme.ts";

type ShellState =
	| { phase: "idle" }
	| { phase: "loading"; steps: StepLog[]; startTime: number }
	| { phase: "results"; data: NewprOutput }
	| { phase: "error"; message: string };

interface ShellProps {
	token: string;
	config: NewprConfig;
	initialPr?: string;
}

const VERSION = "0.1.0";

export function Shell({ token, config, initialPr }: ShellProps) {
	const { exit } = useApp();
	const [state, setState] = useState<ShellState>({ phase: "idle" });
	const [sessions, setSessions] = useState<SessionRecord[]>([]);
	const [elapsed, setElapsed] = useState(0);
	const autoStarted = useRef(false);
	const eventsRef = useRef<ProgressEvent[]>([]);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		listSessions(10).then(setSessions);
	}, []);

	useEffect(() => {
		if (state.phase === "loading") {
			timerRef.current = setInterval(() => {
				setElapsed(Date.now() - state.startTime);
			}, 500);
			return () => {
				if (timerRef.current) clearInterval(timerRef.current);
			};
		}
		if (timerRef.current) clearInterval(timerRef.current);
	}, [state.phase, state.phase === "loading" ? state.startTime : 0]);

	const analyze = useCallback(
		async (input: string) => {
			try {
				const pr = parsePrInput(input.trim());
				const startTime = Date.now();
				eventsRef.current = [];
				setState({ phase: "loading", steps: [], startTime });
				setElapsed(0);

				const result = await analyzePr({
					pr,
					token,
					config,
					onProgress: (event: ProgressEvent) => {
						const prev = eventsRef.current;
						const lastIdx = prev.length - 1;
						if (
							lastIdx >= 0 &&
							prev[lastIdx]!.stage === event.stage &&
							event.partial_content &&
							prev[lastIdx]!.partial_content
						) {
							eventsRef.current = [...prev.slice(0, lastIdx), event];
						} else {
							eventsRef.current = [...prev, event];
						}
						const steps = buildStepLog(eventsRef.current);
						setState({ phase: "loading", steps, startTime });
					},
				});

				await saveSession(result);
				const updated = await listSessions(10);
				setSessions(updated);

				setState({ phase: "results", data: result });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setState({ phase: "error", message: msg });
			}
		},
		[token, config],
	);

	const loadFromHistory = useCallback(async (sessionId: string) => {
		eventsRef.current = [];
		setState({ phase: "loading", steps: [], startTime: Date.now() });
		const data = await loadSession(sessionId);
		if (data) {
			setState({ phase: "results", data });
		} else {
			setState({ phase: "error", message: "Session data not found." });
		}
	}, []);

	useEffect(() => {
		if (initialPr && !autoStarted.current) {
			autoStarted.current = true;
			analyze(initialPr);
		}
	}, [initialPr, analyze]);

	const goBack = useCallback(() => {
		setState({ phase: "idle" });
	}, []);

	if (state.phase === "idle" || state.phase === "error") {
		return (
			<IdleScreen
				error={state.phase === "error" ? state.message : undefined}
				sessions={sessions}
				onSubmit={analyze}
				onLoadSession={loadFromHistory}
				onQuit={exit}
			/>
		);
	}

	if (state.phase === "loading") {
		return <LoadingTimeline steps={state.steps} elapsed={elapsed} />;
	}

	return <App data={state.data} onBack={goBack} />;
}

function IdleScreen({
	error,
	sessions,
	onSubmit,
	onLoadSession,
	onQuit,
}: {
	error?: string;
	sessions: SessionRecord[];
	onSubmit: (input: string) => void;
	onLoadSession: (id: string) => void;
	onQuit: () => void;
}) {
	const [mode, setMode] = useState<"input" | "history">(sessions.length > 0 ? "history" : "input");
	const [historyIdx, setHistoryIdx] = useState(0);

	useInput(
		(input, key) => {
			if (input === "q") {
				onQuit();
				return;
			}

			if (mode === "history") {
				if (key.upArrow || input === "k") {
					setHistoryIdx((i) => Math.max(0, i - 1));
					return;
				}
				if (key.downArrow || input === "j") {
					setHistoryIdx((i) => Math.min(sessions.length - 1, i + 1));
					return;
				}
				if (key.return) {
					const s = sessions[historyIdx];
					if (s) onLoadSession(s.id);
					return;
				}
				if (input === "n" || input === "/") {
					setMode("input");
					return;
				}
			}

			if (mode === "input") {
				if (key.escape && sessions.length > 0) {
					setMode("history");
					return;
				}
			}
		},
		{ isActive: mode === "history" },
	);

	return (
		<Box flexDirection="column">
			<Box flexDirection="column" paddingX={2} paddingY={1}>
				<Text bold color={T.primary}>
					{`  ┌─┐┌─┐┬ ┬┌─┐┬─┐
  │││├┤ │││├─┘├┬┘
  ┘└┘└─┘└┴┘┴  ┴└─`}
				</Text>
				<Box gap={1} paddingLeft={2}>
					<Text color={T.muted}>v{VERSION}</Text>
					<Text color={T.faint}>│</Text>
					<Text color={T.muted}>AI-powered large PR review</Text>
				</Box>
			</Box>

			{error && (
				<Box paddingX={2} marginBottom={1}>
					<Text color={T.error} bold>✗ </Text>
					<Text color={T.error}>{error}</Text>
				</Box>
			)}

			{sessions.length > 0 && (
				<Box flexDirection="column" paddingX={2} marginBottom={1}>
					<Box gap={1} marginBottom={1}>
						<Text color={mode === "history" ? T.primary : T.muted} bold>
							Recent Sessions
						</Text>
						<Text color={T.faint}>│</Text>
						<Text color={T.muted}>
							<Text color={T.primaryBold}>Enter</Text> open  <Text color={T.primaryBold}>n</Text> new
						</Text>
					</Box>
					{sessions.slice(0, 5).map((s, i) => {
						const isSelected = mode === "history" && i === historyIdx;
						const riskColor = RISK_COLORS[s.risk_level] ?? T.warn;
						const ago = formatTimeAgo(s.analyzed_at);
						return (
							<Box key={s.id} gap={1}>
								<Text inverse={isSelected} bold={isSelected}>
									{isSelected ? "❯" : " "}
									<Text color={isSelected ? undefined : T.primary}> #{s.pr_number}</Text>
									{" "}
									<Text color={isSelected ? undefined : T.text}>{s.pr_title.slice(0, 50)}</Text>
								</Text>
								{!isSelected && (
									<>
										<Text color={riskColor}>●</Text>
										<Text color={T.muted}>{s.repo}</Text>
										<Text color={T.faint}>{ago}</Text>
									</>
								)}
							</Box>
						);
					})}
				</Box>
			)}

			{mode === "input" && (
				<InputBar
					placeholder="Paste a PR URL or type owner/repo#123..."
					onSubmit={onSubmit}
				/>
			)}

			{mode === "history" && (
				<Box paddingX={2}>
					<Text color={T.faint}>Press </Text>
					<Text color={T.primaryBold} bold>n</Text>
					<Text color={T.faint}> or </Text>
					<Text color={T.primaryBold} bold>/</Text>
					<Text color={T.faint}> to analyze a new PR</Text>
				</Box>
			)}

			<Box paddingX={2} marginTop={1}>
				<Text color={T.primaryBold} bold>Enter</Text><Text color={T.muted}> {mode === "history" ? "open session" : "analyze"}  </Text>
				{sessions.length > 0 && (
					<>
						<Text color={T.primaryBold} bold>{mode === "history" ? "n" : "Esc"}</Text>
						<Text color={T.muted}> {mode === "history" ? "new PR" : "history"}  </Text>
					</>
				)}
				<Text color={T.primaryBold} bold>q</Text><Text color={T.muted}> quit</Text>
			</Box>
		</Box>
	);
}

function formatTimeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return `${Math.floor(days / 30)}mo ago`;
}
