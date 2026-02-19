import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Layers, FolderTree, BookOpen, MessageSquare, GitBranch, Sparkles, Check, ChevronDown, AlertTriangle, RefreshCw, Presentation, GitPullRequestArrow } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs.tsx";
import type { NewprOutput } from "../../../types/output.ts";
import { GroupsPanel } from "../panels/GroupsPanel.tsx";
import { FilesPanel } from "../panels/FilesPanel.tsx";
import { StoryPanel } from "../panels/StoryPanel.tsx";
import { DiscussionPanel } from "../panels/DiscussionPanel.tsx";
import { CartoonPanel } from "../panels/CartoonPanel.tsx";
import { SlidesPanel } from "../panels/SlidesPanel.tsx";
import { StackPanel } from "../panels/StackPanel.tsx";
import { ReviewModal } from "./ReviewModal.tsx";
import { useOutdatedCheck } from "../hooks/useOutdatedCheck.ts";

const VALID_TABS = ["story", "discussion", "groups", "files", "stack", "slides", "cartoon"] as const;
type TabValue = typeof VALID_TABS[number];

function getInitialTab(): TabValue {
	const param = new URLSearchParams(window.location.search).get("tab");
	if (param && VALID_TABS.includes(param as TabValue)) return param as TabValue;
	return "story";
}

function setTabParam(tab: string) {
	const url = new URL(window.location.href);
	url.searchParams.set("tab", tab);
	window.history.replaceState(null, "", url.toString());
}

const RISK_DOT: Record<string, string> = {
	low: "bg-green-500",
	medium: "bg-yellow-500",
	high: "bg-red-500",
	critical: "bg-red-600",
};

const STATE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
	open: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", label: "Open" },
	merged: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", label: "Merged" },
	closed: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", label: "Closed" },
	draft: { bg: "bg-neutral-500/10", text: "text-neutral-500", label: "Draft" },
};

export function ResultsScreen({
	data,
	onBack,
	activeId,
	onAnchorClick,
	cartoonEnabled,
	sessionId,
	onTabChange,
	onReanalyze,
	enabledPlugins,
	onTrackAnalysis,
}: {
	data: NewprOutput;
	onBack: () => void;
	activeId: string | null;
	onAnchorClick: (kind: "group" | "file" | "line", id: string) => void;
	cartoonEnabled?: boolean;
	sessionId?: string | null;
	onTabChange?: (tab: string) => void;
	onReanalyze?: (prUrl: string) => void;
	enabledPlugins?: string[];
	onTrackAnalysis?: (analysisSessionId: string, prUrl: string) => void;
}) {
	const { meta, summary } = data;
	const [tab, setTab] = useState<TabValue>(getInitialTab);
	const [reviewOpen, setReviewOpen] = useState(false);
	const outdated = useOutdatedCheck(sessionId);

	const stickyRef = useRef<HTMLDivElement>(null);
	const collapsibleRef = useRef<HTMLDivElement>(null);
	const compactRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sticky = stickyRef.current;
		const collapsible = collapsibleRef.current;
		const compact = compactRef.current;
		if (!sticky || !collapsible || !compact) return;

		const scrollParent = sticky.closest("main") ?? sticky.closest("[class*=overflow-y-auto]");
		if (!scrollParent) return;

		let wasScrolled = false;

		const onScroll = () => {
			const scrolled = scrollParent.scrollTop > 0;
			if (scrolled === wasScrolled) return;
			wasScrolled = scrolled;

			collapsible.style.maxHeight = scrolled ? "0px" : "none";
			collapsible.style.opacity = scrolled ? "0" : "1";
			compact.style.maxHeight = scrolled ? "40px" : "0px";
			compact.style.opacity = scrolled ? "1" : "0";
			sticky.classList.toggle("border-b", scrolled);
		};

		scrollParent.addEventListener("scroll", onScroll, { passive: true });
		return () => scrollParent.removeEventListener("scroll", onScroll);
	}, []);

	const handleTabChange = useCallback((value: string) => {
		setTab(value as TabValue);
		setTabParam(value);
		onTabChange?.(value);
	}, [onTabChange]);

	const repoSlug = meta.pr_url.replace(/^https?:\/\/github\.com\//, "").replace(/\/pull\//, "#");

	return (
		<>
		<Tabs value={tab} onValueChange={handleTabChange} className="flex flex-col">
			<div ref={stickyRef} className="sticky top-0 z-10 bg-background -mx-10 px-10">
				<div ref={collapsibleRef} className="overflow-hidden transition-[max-height,opacity] duration-200">
					<div className="pb-4 pt-1">
						<div className="flex items-center gap-2 mb-3">
							<button
								type="button"
								onClick={onBack}
								className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors shrink-0 -ml-1"
							>
								<ArrowLeft className="h-3.5 w-3.5" />
							</button>
							<a
								href={meta.pr_url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-muted-foreground/50 font-mono hover:text-foreground transition-colors"
							>
								{repoSlug}
							</a>
							{meta.pr_state && (() => {
								const s = STATE_STYLES[meta.pr_state] ?? STATE_STYLES.open!;
								return (
									<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${s!.bg} ${s!.text}`}>
										{s!.label}
									</span>
								);
							})()}
							<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${RISK_DOT[summary.risk_level] ?? RISK_DOT.medium}`} />
							<div className="flex-1" />
							{meta.pr_state !== "merged" && meta.pr_state !== "closed" && (
								<button
									type="button"
									onClick={() => setReviewOpen(true)}
									className="flex items-center gap-1.5 h-7 px-3 rounded-md border text-[11px] font-medium text-foreground hover:bg-accent/40 transition-colors shrink-0"
								>
									<Check className="h-3 w-3" />
									Review
									<ChevronDown className="h-3 w-3 text-muted-foreground/40" />
								</button>
							)}
						</div>

						<h1 className="text-sm font-semibold tracking-tight mb-3 line-clamp-2">{meta.pr_title}</h1>

						<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground/50">
							<a
								href={meta.author_url ?? `https://github.com/${meta.author}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 hover:text-foreground transition-colors"
							>
								{meta.author_avatar && (
									<img src={meta.author_avatar} alt={meta.author} className="h-4 w-4 rounded-full" />
								)}
								<span>{meta.author}</span>
							</a>
							<span className="text-muted-foreground/15">|</span>
							<div className="flex items-center gap-1">
								<GitBranch className="h-3 w-3 text-muted-foreground/30" />
								<span className="font-mono">{meta.head_branch}</span>
								<span className="text-muted-foreground/25">→</span>
								<span className="font-mono">{meta.base_branch}</span>
							</div>
							<span className="text-muted-foreground/15">|</span>
							<div className="flex items-center gap-1.5">
								<span className="text-green-600 dark:text-green-400 tabular-nums">+{meta.total_additions}</span>
								<span className="text-red-600 dark:text-red-400 tabular-nums">-{meta.total_deletions}</span>
								<span className="text-muted-foreground/25">·</span>
								<span className="tabular-nums">{meta.total_files_changed} files</span>
							</div>
						</div>
					</div>
					{outdated?.outdated && (
						<div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
							<AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
							<span className="text-[11px] text-yellow-700 dark:text-yellow-300 flex-1">
								This PR has been updated since this analysis was created.
							</span>
							{onReanalyze && (
								<button
									type="button"
									onClick={() => onReanalyze(meta.pr_url)}
									className="flex items-center gap-1 text-[11px] font-medium text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 shrink-0 transition-colors"
								>
									<RefreshCw className="h-3 w-3" />
									Re-analyze
								</button>
							)}
						</div>
					)}
				</div>

				<div ref={compactRef} className="overflow-hidden transition-[max-height,opacity] duration-200" style={{ maxHeight: 0, opacity: 0 }}>
					<div className="flex items-center gap-2.5 min-w-0 pb-2.5">
						<button
							type="button"
							onClick={onBack}
							className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors shrink-0 -ml-1"
						>
							<ArrowLeft className="h-3.5 w-3.5" />
						</button>
						<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${RISK_DOT[summary.risk_level] ?? RISK_DOT.medium}`} />
						{meta.pr_state && (() => {
							const s = STATE_STYLES[meta.pr_state]!;
							return <span className={`text-[9px] font-medium px-1 py-px rounded ${s.bg} ${s.text} shrink-0`}>{s.label}</span>;
						})()}
						<span className="text-xs font-medium truncate flex-1">{meta.pr_title}</span>
						<span className="text-[10px] text-muted-foreground/30 font-mono shrink-0">{repoSlug}</span>
					</div>
				</div>

				<TabsList className="w-full justify-start">
					<TabsTrigger value="story">
						<BookOpen className="h-3 w-3 shrink-0" />
						Story
					</TabsTrigger>
					<TabsTrigger value="discussion">
						<MessageSquare className="h-3 w-3 shrink-0" />
						Discussion
					</TabsTrigger>
					<TabsTrigger value="groups">
						<Layers className="h-3 w-3 shrink-0" />
						Groups
					</TabsTrigger>
					<TabsTrigger value="files">
						<FolderTree className="h-3 w-3 shrink-0" />
						Files
					</TabsTrigger>
					<TabsTrigger value="stack">
						<GitPullRequestArrow className="h-3 w-3 shrink-0" />
						Stack
					</TabsTrigger>
					{(!enabledPlugins || enabledPlugins.includes("slides")) && (
						<TabsTrigger value="slides">
							<Presentation className="h-3 w-3 shrink-0" />
							Slides
						</TabsTrigger>
					)}
					{(!enabledPlugins || enabledPlugins.includes("cartoon")) && (
						<TabsTrigger value="cartoon">
							<Sparkles className="h-3 w-3 shrink-0" />
							Comic
						</TabsTrigger>
					)}
				</TabsList>
			</div>

			<TabsContent value="story">
				<StoryPanel data={data} activeId={activeId} onAnchorClick={onAnchorClick} />
			</TabsContent>
			<TabsContent value="discussion">
				<DiscussionPanel sessionId={sessionId} />
			</TabsContent>
			<TabsContent value="groups">
				<GroupsPanel groups={data.groups} />
			</TabsContent>
			<TabsContent value="files">
				<FilesPanel
					files={data.files}
					groups={data.groups}
					selectedPath={activeId?.startsWith("file:") ? activeId.slice(5) : null}
					onFileSelect={(path: string) => onAnchorClick("file", path)}
				/>
			</TabsContent>
			<TabsContent value="stack">
				<StackPanel sessionId={sessionId} onTrackAnalysis={onTrackAnalysis} />
			</TabsContent>
			<TabsContent value="slides">
				<SlidesPanel data={data} sessionId={sessionId} />
			</TabsContent>
			{cartoonEnabled && (
				<TabsContent value="cartoon">
					<CartoonPanel data={data} sessionId={sessionId} />
				</TabsContent>
			)}
		</Tabs>
		{reviewOpen && (
			<ReviewModal prUrl={meta.pr_url} onClose={() => setReviewOpen(false)} />
		)}
		</>
	);
}
