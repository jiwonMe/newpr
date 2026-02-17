import { useState } from "react";
import { Sun, Moon, Monitor, Plus, Clock, Settings } from "lucide-react";
import type { SessionRecord } from "../../../history/types.ts";
import { SettingsPanel } from "./SettingsPanel.tsx";

type Theme = "light" | "dark" | "system";

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

const RISK_DOT: Record<string, string> = {
	low: "bg-green-500",
	medium: "bg-yellow-500",
	high: "bg-red-500",
	critical: "bg-red-600",
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

export function AppShell({
	theme,
	onThemeChange,
	sessions,
	onSessionSelect,
	onNewAnalysis,
	children,
}: {
	theme: Theme;
	onThemeChange: (t: Theme) => void;
	sessions: SessionRecord[];
	onSessionSelect: (sessionId: string) => void;
	onNewAnalysis: () => void;
	children: React.ReactNode;
}) {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const Icon = THEME_ICON[theme];
	const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;

	return (
		<div className="flex h-screen bg-background overflow-hidden">
			<aside className="flex flex-col w-64 shrink-0 border-r bg-background">
				<div className="flex h-14 items-center justify-between px-4 border-b">
					<button
						type="button"
						onClick={onNewAnalysis}
						className="flex items-center gap-2 hover:opacity-80 transition-opacity"
					>
						<span className="text-sm font-semibold tracking-tight">newpr</span>
						<span className="text-[10px] text-muted-foreground">v0.1.0</span>
					</button>
					<button
						type="button"
						onClick={onNewAnalysis}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
						title="New analysis"
					>
						<Plus className="h-4 w-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto">
					{sessions.length > 0 && (
						<div className="px-2 py-3">
							<div className="px-2 pb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
								Recent
							</div>
							<div className="space-y-0.5">
								{sessions.map((s) => (
									<button
										key={s.id}
										type="button"
										onClick={() => onSessionSelect(s.id)}
										className="w-full flex items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/50 transition-colors group"
									>
										<span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RISK_DOT[s.risk_level] ?? RISK_DOT.medium}`} />
										<div className="flex-1 min-w-0">
											<div className="text-sm truncate group-hover:text-foreground transition-colors">
												{s.pr_title}
											</div>
											<div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
												<span className="truncate">{s.repo.split("/").pop()}</span>
												<span>#{s.pr_number}</span>
												<span className="text-muted-foreground/50">·</span>
												<Clock className="h-2.5 w-2.5" />
												<span>{formatTimeAgo(s.analyzed_at)}</span>
											</div>
										</div>
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="border-t px-4 py-3 flex items-center justify-between">
					<button
						type="button"
						onClick={() => onThemeChange(next)}
						className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
						title={`Switch to ${next} mode`}
					>
						<Icon className="h-3.5 w-3.5" />
						<span className="capitalize">{theme}</span>
					</button>
					<button
						type="button"
						onClick={() => setSettingsOpen(true)}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
						title="Settings"
					>
						<Settings className="h-3.5 w-3.5" />
					</button>
				</div>
			</aside>

			<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-4xl px-8 py-8">
						{children}
					</div>
				</main>
			</div>

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
