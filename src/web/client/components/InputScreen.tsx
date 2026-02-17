import { useState, useEffect } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent } from "../../components/ui/card.tsx";
import type { SessionRecord } from "../../../history/types.ts";

export function InputScreen({ onSubmit }: { onSubmit: (pr: string) => void }) {
	const [value, setValue] = useState("");
	const [sessions, setSessions] = useState<SessionRecord[]>([]);

	useEffect(() => {
		fetch("/api/sessions")
			.then((r) => r.json())
			.then((data) => setSessions(data as SessionRecord[]))
			.catch(() => {});
	}, []);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = value.trim();
		if (trimmed) onSubmit(trimmed);
	}

	return (
		<div className="flex flex-col items-center gap-12 py-16">
			<div className="flex flex-col items-center gap-3">
				<h1 className="text-4xl font-bold tracking-tight">newpr</h1>
				<p className="text-muted-foreground text-center max-w-md">
					AI-powered PR review tool. Paste a PR URL to get a comprehensive analysis.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="w-full max-w-xl">
				<div className="flex gap-2">
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="https://github.com/owner/repo/pull/123"
						className="flex-1 h-11 rounded-lg border bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						autoFocus
					/>
					<Button type="submit" size="lg" disabled={!value.trim()}>
						Analyze
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				</div>
			</form>

			{sessions.length > 0 && (
				<div className="w-full max-w-xl">
					<h3 className="text-sm font-medium text-muted-foreground mb-3">Recent</h3>
					<div className="space-y-2">
						{sessions.slice(0, 5).map((s) => (
							<Card
								key={s.id}
								className="cursor-pointer hover:bg-accent/50 transition-colors"
								onClick={() => onSubmit(`https://github.com/${s.repo}/pull/${s.pr_number}`)}
							>
								<CardContent className="flex items-center gap-3 p-4">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm">#{s.pr_number}</span>
											<span className="text-sm truncate">{s.pr_title}</span>
										</div>
										<div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
											<span>{s.repo}</span>
											<span>·</span>
											<Clock className="h-3 w-3" />
											<span>{formatTimeAgo(s.analyzed_at)}</span>
										</div>
									</div>
									<RiskBadge level={s.risk_level} />
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function RiskBadge({ level }: { level: string }) {
	const colors: Record<string, string> = {
		low: "bg-green-500/10 text-green-600 dark:text-green-400",
		medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
		high: "bg-red-500/10 text-red-600 dark:text-red-400",
		critical: "bg-red-500/20 text-red-700 dark:text-red-300",
	};

	return (
		<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[level] ?? colors.medium}`}>
			{level}
		</span>
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
	return `${days}d ago`;
}
