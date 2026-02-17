import { useState } from "react";
import { CornerDownLeft, Clock, GitPullRequest } from "lucide-react";
import type { SessionRecord } from "../../../history/types.ts";

const RISK_DOT: Record<string, string> = {
	low: "bg-green-500",
	medium: "bg-yellow-500",
	high: "bg-red-500",
	critical: "bg-red-600",
};

function timeAgo(date: string): string {
	const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return `${Math.floor(d / 30)}mo ago`;
}

export function InputScreen({
	onSubmit,
	sessions,
	onSessionSelect,
}: {
	onSubmit: (pr: string) => void;
	sessions?: SessionRecord[];
	onSessionSelect?: (id: string) => void;
}) {
	const [value, setValue] = useState("");
	const [focused, setFocused] = useState(false);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = value.trim();
		if (trimmed) onSubmit(trimmed);
	}

	const recents = sessions?.slice(0, 5) ?? [];

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh]">
			<div className="w-full max-w-lg space-y-8">
				<div className="space-y-2">
					<div className="flex items-baseline gap-2">
						<h1 className="text-sm font-semibold tracking-tight font-mono">newpr</h1>
						<span className="text-[10px] text-muted-foreground/40">AI code review</span>
					</div>
					<p className="text-xs text-muted-foreground">
						Paste a GitHub PR URL to start analysis
					</p>
				</div>

				<form onSubmit={handleSubmit}>
					<div className={`flex items-center rounded-xl border bg-background transition-all ${
						focused ? "ring-1 ring-ring border-foreground/15 shadow-sm" : "border-border"
					}`}>
						<GitPullRequest className="h-3.5 w-3.5 text-muted-foreground/40 ml-4 shrink-0" />
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onFocus={() => setFocused(true)}
							onBlur={() => setFocused(false)}
							placeholder="https://github.com/owner/repo/pull/123"
							className="flex-1 h-11 bg-transparent px-3 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none"
							autoFocus
						/>
						<button
							type="submit"
							disabled={!value.trim()}
							className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background mr-2 transition-opacity disabled:opacity-20 hover:opacity-80"
						>
							<CornerDownLeft className="h-3.5 w-3.5" />
						</button>
					</div>
					<div className="flex justify-end mt-2 pr-1">
						<span className="text-[10px] text-muted-foreground/30">
							Enter to analyze
						</span>
					</div>
				</form>

				{recents.length > 0 && (
					<div className="space-y-2 pt-2">
						<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider px-0.5">
							Recent
						</div>
						<div className="space-y-px">
							{recents.map((s) => (
								<button
									key={s.id}
									type="button"
									onClick={() => onSessionSelect?.(s.id)}
									className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent/50 transition-colors group"
								>
									<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${RISK_DOT[s.risk_level] ?? RISK_DOT.medium}`} />
									<div className="flex-1 min-w-0">
										<div className="text-xs truncate group-hover:text-foreground transition-colors">
											{s.pr_title}
										</div>
										<div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground/50">
											<span className="font-mono truncate">{s.repo.split("/").pop()}</span>
											<span className="font-mono">#{s.pr_number}</span>
											<span className="text-muted-foreground/20">·</span>
											<span className="text-green-600 dark:text-green-400">+{s.total_additions}</span>
											<span className="text-red-600 dark:text-red-400">-{s.total_deletions}</span>
										</div>
									</div>
									<div className="flex items-center gap-1 text-[10px] text-muted-foreground/30 shrink-0">
										<Clock className="h-2.5 w-2.5" />
										<span>{timeAgo(s.analyzed_at)}</span>
									</div>
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
