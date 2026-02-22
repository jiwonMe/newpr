import { useState, useEffect } from "react";
import { CornerDownLeft, GitPullRequest, ExternalLink, ChevronUp } from "lucide-react";
import type { SessionRecord } from "../../../history/types.ts";
import { analytics } from "../lib/analytics.ts";

interface ToolStatus {
	name: string;
	installed: boolean;
	version?: string;
	detail?: string;
}

interface PreflightData {
	github: ToolStatus & { authenticated: boolean; user?: string };
	agents: ToolStatus[];
	openrouterKey: boolean;
}

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

function StatusDot({ ok, optional }: { ok: boolean; optional?: boolean }) {
	if (ok) return <span className="h-1.5 w-1.5 rounded-full bg-green-500" />;
	if (optional) return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/15" />;
	return <span className="h-1.5 w-1.5 rounded-full bg-red-500" />;
}

function CompactStatus({ data }: { data: PreflightData }) {
	const [open, setOpen] = useState(false);
	const gh = data.github;
	const allOk = gh.installed && gh.authenticated && data.openrouterKey;
	return (
		<div className="flex flex-col items-end gap-1">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
			>
				<StatusDot ok={allOk} />
				<span className="text-[10px] font-mono text-muted-foreground/30">status</span>
				<ChevronUp className={`h-2.5 w-2.5 text-muted-foreground/20 transition-transform ${open ? "" : "rotate-180"}`} />
			</button>
			{open && (
				<div className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
					<div className="flex items-center gap-1.5">
						<StatusDot ok={gh.installed && gh.authenticated} />
						<span className="text-[10px] font-mono text-muted-foreground/30">gh</span>
						{gh.installed && gh.authenticated && gh.user && (
							<span className="text-[10px] text-muted-foreground/20">{gh.user}</span>
						)}
					</div>
					{data.agents.map((agent) => (
						<div key={agent.name} className="flex items-center gap-1.5">
							<StatusDot ok={agent.installed} optional />
							<span className={`text-[10px] font-mono ${agent.installed ? "text-muted-foreground/30" : "text-muted-foreground/10"}`}>
								{agent.name}
							</span>
						</div>
					))}
					<div className="flex items-center gap-1.5">
						<StatusDot ok={data.openrouterKey} />
						<span className="text-[10px] font-mono text-muted-foreground/30">OpenRouter</span>
					</div>
				</div>
			)}
		</div>
	);
}

export function InputScreen({
	onSubmit,
	sessions,
	onSessionSelect,
	version,
}: {
	onSubmit: (pr: string) => void;
	sessions?: SessionRecord[];
	onSessionSelect?: (id: string) => void;
	version?: string;
}) {
	const [value, setValue] = useState("");
	const [focused, setFocused] = useState(false);
	const [preflight, setPreflight] = useState<PreflightData | null>(null);

	useEffect(() => {
		fetch("/api/preflight")
			.then((r) => r.json())
			.then((data) => { if (data) setPreflight(data as PreflightData); })
			.catch(() => {});
	}, []);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = value.trim();
		if (trimmed) onSubmit(trimmed);
	}

	const recents = sessions?.slice(0, 5) ?? [];

	return (
		<div className="relative flex flex-col items-center justify-center min-h-[80vh]">
			<div className="w-full max-w-xl space-y-10">

				<div className="flex flex-col items-center text-center space-y-3">
					<div className="flex items-center gap-2.5">
						<h1 className="text-2xl font-bold font-mono tracking-tighter">newpr</h1>
						{version && (
							<span className="text-[10px] text-muted-foreground/30 bg-foreground/[0.03] border border-border/50 rounded-full px-2 py-0.5 font-mono">
								v{version}
							</span>
						)}
					</div>
					<p className="text-base text-muted-foreground/50">
						Turn PRs into navigable stories
					</p>
				</div>

				<div>
					<form onSubmit={handleSubmit}>
						<div className={`flex items-center rounded-xl border bg-background transition-all ${
							focused ? "ring-1 ring-ring border-foreground/15 shadow-sm" : "border-border"
						}`}>
							<GitPullRequest className="h-4 w-4 text-muted-foreground/30 ml-4 shrink-0" />
							<input
								type="text"
								value={value}
								onChange={(e) => setValue(e.target.value)}
								onFocus={() => setFocused(true)}
								onBlur={() => setFocused(false)}
								placeholder="https://github.com/owner/repo/pull/123"
								className="flex-1 h-12 bg-transparent px-3 text-base font-mono placeholder:text-muted-foreground/25 focus:outline-none"
								autoFocus
							/>
							<button
								type="submit"
								disabled={!value.trim()}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background mr-2 transition-opacity disabled:opacity-15 hover:opacity-80"
							>
								<CornerDownLeft className="h-3.5 w-3.5" />
							</button>
						</div>
						<div className="flex justify-center mt-2.5">
							<span className="text-[10px] text-muted-foreground/20 font-mono">
								↵ Enter to analyze
							</span>
						</div>
					</form>
					<div className="mt-4">
						<SponsorBanner />
					</div>
				</div>

				{recents.length > 0 && (
					<div className="space-y-3">
						<div className="text-[10px] font-medium text-muted-foreground/25 uppercase tracking-[0.15em] text-center">
							Recent
						</div>
						<div className="space-y-px">
							{recents.map((s) => (
								<button
									key={s.id}
									type="button"
									onClick={() => onSessionSelect?.(s.id)}
									className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/30 transition-colors group"
								>
									<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${RISK_DOT[s.risk_level] ?? RISK_DOT.medium}`} />
									<div className="flex-1 min-w-0">
										<div className="text-[12px] truncate text-foreground/70 group-hover:text-foreground transition-colors">
											{s.pr_title}
										</div>
									</div>
									<div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground/25">
										<span className="font-mono">{s.repo.split("/").pop()}</span>
										<span className="font-mono">#{s.pr_number}</span>
										<span className="text-muted-foreground/15">·</span>
										<span>{timeAgo(s.analyzed_at)}</span>
									</div>
								</button>
							))}
						</div>
					</div>
				)}

			</div>

			{preflight && (
				<div className="absolute bottom-4 right-0">
					<CompactStatus data={preflight} />
				</div>
			)}
		</div>
	);
}

const SIONIC_HERO_BG = "https://www.sionic.ai/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fmain-intro-bg.1455295d.png&w=1920&q=75";

function SponsorBanner() {
	return (
		<a
			href="https://www.sionic.ai"
			target="_blank"
			rel="noopener noreferrer"
			onClick={() => analytics.sponsorClicked("sionic_ai")}
			className="group relative flex items-center gap-3.5 rounded-xl overflow-hidden px-4 py-3 transition-all hover:shadow-md hover:shadow-blue-500/10"
			style={{ background: "linear-gradient(135deg, #071121 0%, #0d1b33 50%, #1a2d54 100%)" }}
		>
			<img
				src={SIONIC_HERO_BG}
				alt=""
				className="absolute inset-0 w-full h-full object-cover object-bottom opacity-30 group-hover:opacity-45 transition-opacity pointer-events-none"
			/>
			<div className="absolute inset-0 bg-gradient-to-r from-[#071121]/70 via-transparent to-transparent pointer-events-none" />
			<div className="relative flex items-center gap-3 flex-1 min-w-0">
				<img
					src="/assets/sionic-logo.png"
					alt="Sionic AI"
					className="h-4 w-auto shrink-0 drop-shadow-sm"
				/>
				<div className="h-3 w-px bg-white/15 shrink-0" />
				<span className="text-[10px] text-white/45 truncate">
					The Power of AI for Every Business
				</span>
			</div>
			<div className="relative flex items-center gap-1.5 shrink-0">
				<span className="text-[8px] text-white/20 uppercase tracking-widest">Ad</span>
				<ExternalLink className="h-2.5 w-2.5 text-white/15 group-hover:text-white/40 transition-colors" />
			</div>
		</a>
	);
}
