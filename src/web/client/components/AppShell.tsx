import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Sun, Moon, Monitor, Plus, Settings, ArrowUp, Loader2, X, Check, AlertCircle, ChevronRight } from "lucide-react";
import type { BackgroundAnalysis } from "../hooks/useBackgroundAnalyses.ts";
import { useChatLoadingIndicator } from "../hooks/useChatStore.ts";
import type { SessionRecord } from "../../../history/types.ts";
import type { GithubUser } from "../hooks/useGithubUser.ts";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";

type Theme = "light" | "dark" | "system";

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

const LEFT_MIN = 180;
const LEFT_MAX = 400;
const LEFT_DEFAULT = 256;
const RIGHT_MIN = 400;
const RIGHT_MAX = 1200;
const RIGHT_DEFAULT = 560;

const RISK_DOT: Record<string, string> = {
	low: "bg-green-500",
	medium: "bg-yellow-500",
	high: "bg-red-500",
	critical: "bg-red-600",
};

const STATE_LABEL: Record<string, { text: string; class: string }> = {
	open: { text: "Open", class: "text-green-600 dark:text-green-400" },
	merged: { text: "Merged", class: "text-purple-600 dark:text-purple-400" },
	closed: { text: "Closed", class: "text-red-600 dark:text-red-400" },
	draft: { text: "Draft", class: "text-neutral-500" },
};

function formatTimeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

interface RepoGroup {
	repo: string;
	repoShort: string;
	sessions: SessionRecord[];
	latestAt: number;
}

function groupByRepo(sessions: SessionRecord[]): RepoGroup[] {
	const map = new Map<string, SessionRecord[]>();
	for (const s of sessions) {
		const list = map.get(s.repo) ?? [];
		list.push(s);
		map.set(s.repo, list);
	}
	const groups: RepoGroup[] = [];
	for (const [repo, list] of map) {
		const latestAt = Math.max(...list.map((s) => new Date(s.analyzed_at).getTime()));
		groups.push({ repo, repoShort: repo.split("/").pop() ?? repo, sessions: list, latestAt });
	}
	groups.sort((a, b) => b.latestAt - a.latestAt);
	return groups;
}

function SessionList({
	sessions,
	activeSessionId,
	onSessionSelect,
}: {
	sessions: SessionRecord[];
	activeSessionId?: string | null;
	onSessionSelect: (id: string) => void;
}) {
	const groups = useMemo(() => groupByRepo(sessions), [sessions]);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	const toggle = useCallback((repo: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			next.has(repo) ? next.delete(repo) : next.add(repo);
			return next;
		});
	}, []);

	if (sessions.length === 0) {
		return (
			<div className="flex-1 overflow-y-auto px-2 flex flex-col items-center justify-center text-center gap-2 opacity-40">
				<p className="text-[11px] text-muted-foreground">No analyses yet</p>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto px-2 py-1">
			{groups.map((g) => {
				const isCollapsed = collapsed.has(g.repo);
				return (
					<div key={g.repo} className="mb-1">
						<button
							type="button"
							onClick={() => toggle(g.repo)}
							className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-accent/30 transition-colors"
						>
							<ChevronRight className={`h-2.5 w-2.5 text-muted-foreground/30 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
							<span className="text-[11px] font-mono text-muted-foreground/60 truncate">{g.repoShort}</span>
							<span className="text-[10px] text-muted-foreground/25 shrink-0">{g.sessions.length}</span>
						</button>
						{!isCollapsed && (
							<div className="space-y-px mt-px">
								{g.sessions.map((s) => {
									const isActive = activeSessionId === s.id;
									return (
										<button
											key={s.id}
											type="button"
											onClick={() => onSessionSelect(s.id)}
											className={`w-full flex items-start gap-2 rounded-md pl-5 pr-2.5 py-1.5 text-left transition-colors group ${
												isActive ? "bg-accent text-foreground" : "hover:bg-accent/40"
											}`}
										>
											<span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${RISK_DOT[s.risk_level] ?? RISK_DOT.medium}`} />
											<div className="flex-1 min-w-0">
												<div className={`text-[11px] truncate leading-tight ${isActive ? "font-medium" : "text-foreground/80 group-hover:text-foreground"} transition-colors`}>
													{s.pr_title}
												</div>
												<div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/40">
													<span className="font-mono">#{s.pr_number}</span>
													{s.pr_state && STATE_LABEL[s.pr_state] && (
														<>
															<span className="text-muted-foreground/15">·</span>
															<span className={STATE_LABEL[s.pr_state]!.class}>{STATE_LABEL[s.pr_state]!.text}</span>
														</>
													)}
													<span className="text-muted-foreground/15">·</span>
													<span>{formatTimeAgo(s.analyzed_at)}</span>
												</div>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

export function AppShell({
	theme,
	onThemeChange,
	sessions,
	githubUser,
	onSessionSelect,
	onNewAnalysis,
	detailPanel,
	bottomBar,
	activeSessionId,
	version,
	bgAnalyses,
	onBgClick,
	onBgDismiss,
	children,
}: {
	theme: Theme;
	onThemeChange: (t: Theme) => void;
	sessions: SessionRecord[];
	githubUser: GithubUser | null;
	onSessionSelect: (sessionId: string) => void;
	onNewAnalysis: () => void;
	detailPanel?: React.ReactNode;
	bottomBar?: React.ReactNode;
	activeSessionId?: string | null;
	version?: string;
	bgAnalyses?: BackgroundAnalysis[];
	onBgClick?: (sessionId: string) => void;
	onBgDismiss?: (sessionId: string) => void;
	children: React.ReactNode;
}) {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
	const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const mainRef = useRef<HTMLElement>(null);
	const prevDetailPanel = useRef(detailPanel);
	const chatLoading = useChatLoadingIndicator();

	useEffect(() => {
		const wasNull = prevDetailPanel.current == null;
		prevDetailPanel.current = detailPanel;
		if (wasNull && detailPanel != null) {
			const available = window.innerWidth - leftWidth - 2;
			const half = Math.floor(available * 0.55);
			setRightWidth(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, half)));
		}
	}, [detailPanel, leftWidth]);

	const Icon = THEME_ICON[theme];
	const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;

	const handleLeftResize = useCallback((delta: number) => {
		setLeftWidth((w) => Math.min(LEFT_MAX, Math.max(LEFT_MIN, w + delta)));
	}, []);

	const CENTER_MIN = 400;

	const handleRightResize = useCallback((delta: number) => {
		setRightWidth((w) => {
			const available = window.innerWidth - leftWidth - 2;
			const max = Math.min(RIGHT_MAX, available - CENTER_MIN);
			return Math.min(max, Math.max(RIGHT_MIN, w + delta));
		});
	}, [leftWidth]);

	useEffect(() => {
		const el = mainRef.current;
		if (!el) return;
		const onScroll = () => setShowScrollTop(el.scrollTop > 300);
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	const scrollToTop = useCallback(() => {
		mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	return (
		<div className="flex h-screen bg-background overflow-hidden">
			<aside className="flex flex-col shrink-0 border-r bg-background" style={{ width: leftWidth }}>
				<div className="flex h-12 items-center justify-between px-4 shrink-0">
					<button
						type="button"
						onClick={onNewAnalysis}
						className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
					>
						<span className="text-xs font-semibold tracking-tight font-mono">newpr</span>
						{version && <span className="text-[10px] text-muted-foreground/30">v{version}</span>}
					</button>
					<button
						type="button"
						onClick={onNewAnalysis}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
						title="New analysis"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>

				<SessionList
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSessionSelect={onSessionSelect}
				/>

				{bgAnalyses && bgAnalyses.length > 0 && (
					<div className="shrink-0 border-t px-2 py-2 space-y-px">
						{bgAnalyses.map((bg) => (
							<div
								key={bg.sessionId}
								className="flex items-center gap-2 rounded-md px-2.5 py-1.5 group"
							>
								{bg.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40 shrink-0" />}
								{bg.status === "done" && <Check className="h-3 w-3 text-green-500 shrink-0" />}
								{bg.status === "error" && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
								<button
									type="button"
									onClick={() => onBgClick?.(bg.sessionId)}
									className="flex-1 min-w-0 text-left"
								>
									<div className="text-[11px] truncate text-muted-foreground/70">
										{bg.prTitle ?? bg.prInput}
									</div>
									{bg.status === "running" && bg.lastMessage && (
										<div className="text-[10px] text-muted-foreground/30 truncate font-mono mt-0.5">
											{bg.lastMessage}
										</div>
									)}
								</button>
								<button
									type="button"
									onClick={(e) => { e.stopPropagation(); onBgDismiss?.(bg.sessionId); }}
									className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/20 hover:text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
								>
									<X className="h-2.5 w-2.5" />
								</button>
							</div>
						))}
					</div>
				)}

				{chatLoading.length > 0 && (
					<div className="shrink-0 border-t px-2 py-2 space-y-px">
						{chatLoading.map(({ sessionId: sid }) => (
							<div key={sid} className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
								<Loader2 className="h-3 w-3 animate-spin text-blue-500/60 shrink-0" />
								<span className="text-[11px] text-muted-foreground/50 truncate">Chat responding...</span>
							</div>
						))}
					</div>
				)}

				<div className="shrink-0 border-t px-2 py-2 space-y-1">
					{githubUser && (
						<a
							href={githubUser.html_url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-accent/40 transition-colors"
						>
							<img
								src={githubUser.avatar_url}
								alt={githubUser.login}
								className="h-5 w-5 rounded-full"
							/>
							<span className="text-[11px] font-medium truncate flex-1">{githubUser.name ?? githubUser.login}</span>
						</a>
					)}
					<div className="flex items-center gap-1 px-1">
						<button
							type="button"
							onClick={() => onThemeChange(next)}
							className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] text-muted-foreground/50 hover:text-foreground hover:bg-accent/40 transition-colors"
							title={`Switch to ${next} mode`}
						>
							<Icon className="h-3 w-3" />
							<span className="capitalize">{theme}</span>
						</button>
						<div className="flex-1" />
						<button
							type="button"
							onClick={() => setSettingsOpen(true)}
							className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-accent/40 hover:text-foreground transition-colors"
							title="Settings"
						>
							<Settings className="h-3 w-3" />
						</button>
					</div>
				</div>
			</aside>

			<ResizeHandle onResize={handleLeftResize} side="right" />

			<div className="flex-1 flex flex-col overflow-hidden relative" style={{ minWidth: 400 }}>
				<main ref={mainRef} className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-5xl px-10 py-10">
						{children}
					</div>
				</main>
				{bottomBar}
				{showScrollTop && (
					<button
						type="button"
						onClick={scrollToTop}
						className="absolute bottom-3 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
						style={{ bottom: bottomBar ? 76 : 12 }}
					>
						<ArrowUp className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			{detailPanel && (
				<>
					<ResizeHandle onResize={handleRightResize} side="left" />
					<aside className="shrink-0 border-l bg-background overflow-y-auto" style={{ width: rightWidth }}>
						{detailPanel}
					</aside>
				</>
			)}

			{settingsOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div
						className="absolute inset-0 bg-black/50 backdrop-blur-sm"
						onClick={() => setSettingsOpen(false)}
						onKeyDown={(e) => { if (e.key === "Escape") setSettingsOpen(false); }}
					/>
					<div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border bg-background p-6 shadow-lg">
						<SettingsPanel onClose={() => setSettingsOpen(false)} />
					</div>
				</div>
			)}
		</div>
	);
}
