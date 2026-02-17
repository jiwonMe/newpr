import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { NewprOutput } from "../types/output.ts";
import type { NewprConfig } from "../types/config.ts";
import type { ProgressEvent } from "../analyzer/progress.ts";
import type { SessionRecord } from "../history/types.ts";
import type { AgentToolName } from "../workspace/types.ts";
import { parsePrInput } from "../github/parse-pr.ts";
import { analyzePr } from "../analyzer/pipeline.ts";
import { saveSession, savePatchesSidecar, listSessions, loadSession } from "../history/store.ts";
import { detectAgents } from "../workspace/agent.ts";
import { App } from "./App.tsx";
import { InputBar } from "./InputBar.tsx";
import { LoadingTimeline, buildStepLog, type StepLog } from "./Loading.tsx";
import { T, RISK_COLORS } from "./theme.ts";
import { filterCommands, executeCommand, type CmdResult } from "./commands.ts";

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

const LOGO = ` ████████    ██████  █████ ███ █████ ████████  ████████
░░███░░███  ███░░███░░███ ░███░░███ ░░███░░███░░███░░███
 ░███ ░███ ░███████  ░███ ░███ ░███  ░███ ░███ ░███ ░░░
 ░███ ░███ ░███░░░   ░░███████████   ░███ ░███ ░███
 ████ █████░░██████   ░░████░████    ░███████  █████
░░░░ ░░░░░  ░░░░░░     ░░░░ ░░░░     ░███░░░  ░░░░░
                                     ░███
                                     █████
                                    ░░░░░░`;

export function Shell({ token, config: initialConfig, initialPr }: ShellProps) {
	const { exit } = useApp();
	const [liveConfig, setLiveConfig] = useState<NewprConfig>(initialConfig);
	const [state, setState] = useState<ShellState>({ phase: "idle" });
	const [sessions, setSessions] = useState<SessionRecord[]>([]);
	const [elapsed, setElapsed] = useState(0);
	const [detectedAgent, setDetectedAgent] = useState<AgentToolName | null>(null);
	const autoStarted = useRef(false);
	const eventsRef = useRef<ProgressEvent[]>([]);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		listSessions(10).then(setSessions);
	}, []);

	useEffect(() => {
		detectAgents().then((agents) => {
			if (liveConfig.agent) {
				const found = agents.find((a) => a.name === liveConfig.agent);
				setDetectedAgent(found ? found.name : null);
			} else if (agents.length > 0) {
				setDetectedAgent(agents[0]!.name);
			}
		});
	}, [liveConfig.agent]);

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

	const handleCommand = useCallback(async (input: string): Promise<CmdResult> => {
		const result = await executeCommand(input, liveConfig);
		if (result.configUpdate) {
			setLiveConfig((prev) => ({ ...prev, ...result.configUpdate }));
		}
		return result;
	}, [liveConfig]);

	const analyze = useCallback(
		async (input: string) => {
			try {
				const pr = parsePrInput(input.trim());
				const startTime = Date.now();
				eventsRef.current = [];
				setState({ phase: "loading", steps: [], startTime });
				setElapsed(0);

				let capturedPatches: Record<string, string> = {};
				const result = await analyzePr({
					pr,
					token,
					config: liveConfig,
					onFilePatches: (patches) => { capturedPatches = patches; },
					onProgress: (event: ProgressEvent) => {
						const stamped = { ...event, timestamp: event.timestamp ?? Date.now() };
						const prev = eventsRef.current;
						const lastIdx = prev.length - 1;
						if (
							lastIdx >= 0 &&
							prev[lastIdx]!.stage === stamped.stage &&
							stamped.partial_content &&
							prev[lastIdx]!.partial_content
						) {
							eventsRef.current = [...prev.slice(0, lastIdx), stamped];
						} else {
							eventsRef.current = [...prev, stamped];
						}
						const steps = buildStepLog(eventsRef.current);
						setState({ phase: "loading", steps, startTime });
					},
				});

				const record = await saveSession(result);
				if (Object.keys(capturedPatches).length > 0) {
					await savePatchesSidecar(record.id, capturedPatches).catch(() => {});
				}
				const updated = await listSessions(10);
				setSessions(updated);

				setState({ phase: "results", data: result });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setState({ phase: "error", message: msg });
			}
		},
		[token, liveConfig],
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
				config={liveConfig}
				detectedAgent={detectedAgent}
				onCommand={handleCommand}
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
	config,
	detectedAgent,
	onCommand,
	onSubmit,
	onLoadSession,
	onQuit,
}: {
	error?: string;
	sessions: SessionRecord[];
	config: NewprConfig;
	detectedAgent: AgentToolName | null;
	onCommand: (input: string) => Promise<CmdResult>;
	onSubmit: (input: string) => void;
	onLoadSession: (id: string) => void;
	onQuit: () => void;
}) {
	const [mode, setMode] = useState<"input" | "history">(sessions.length > 0 ? "history" : "input");
	const [historyIdx, setHistoryIdx] = useState(0);
	const [inputValue, setInputValue] = useState("");
	const [notice, setNotice] = useState<CmdResult | null>(null);
	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	function showNotice(result: CmdResult) {
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		setNotice(result);
		noticeTimer.current = setTimeout(() => setNotice(null), 4000);
	}

	function handleSubmit(value: string) {
		if (value.startsWith("/")) {
			onCommand(value).then(showNotice);
		} else {
			setNotice(null);
			onSubmit(value);
		}
	}

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

	const showPalette = mode === "input" && inputValue.startsWith("/");
	const paletteItems = showPalette ? filterCommands(inputValue) : [];

	return (
		<Box flexDirection="column">
			<Box flexDirection="column" paddingX={2} paddingY={1}>
				<Text bold color={T.primary}>{LOGO}</Text>
				<Box gap={1} paddingLeft={2}>
					<Text color={T.muted}>v{VERSION}</Text>
					<Text color={T.faint}>│</Text>
					<Text color={T.muted}>{config.model.split("/").pop()}</Text>
					<Text color={T.faint}>│</Text>
					<Text color={T.muted}>{config.language}</Text>
					<Text color={T.faint}>│</Text>
					{detectedAgent
						? <Text color={T.primary}>{detectedAgent}</Text>
						: <Text color={T.error}>no agent</Text>
					}
				</Box>
			</Box>

			{notice && (
				<Box paddingX={2} marginBottom={1}>
					<Text color={notice.ok ? T.ok : T.error} bold>{notice.ok ? "✓" : "✗"} </Text>
					<Text color={notice.ok ? T.text : T.error}>{notice.text}</Text>
				</Box>
			)}

			{error && !notice && (
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
				<Box flexDirection="column">
					<InputBar
						placeholder="PR URL, owner/repo#123, or / for commands..."
						onSubmit={handleSubmit}
						onChange={setInputValue}
					/>
					{showPalette && (
						<Box flexDirection="column" paddingX={4} marginTop={0}>
							{paletteItems.map((cmd) => (
								<Box key={cmd.name} gap={1}>
									<Text color={T.primary}>/{cmd.name}</Text>
									{cmd.args && <Text color={T.faint}>{cmd.args}</Text>}
									<Text color={T.muted}>{cmd.desc}</Text>
								</Box>
							))}
							{paletteItems.length === 0 && (
								<Text color={T.faint}>No matching commands</Text>
							)}
						</Box>
					)}
				</Box>
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
				<Text color={T.primaryBold} bold>/</Text><Text color={T.muted}> commands  </Text>
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
