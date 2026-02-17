import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Layers, FolderTree, BookOpen, MessageSquare, GitBranch, User, Files, Bot, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs.tsx";
import type { NewprOutput } from "../../../types/output.ts";
import { GroupsPanel } from "../panels/GroupsPanel.tsx";
import { FilesPanel } from "../panels/FilesPanel.tsx";
import { StoryPanel } from "../panels/StoryPanel.tsx";
import { DiscussionPanel } from "../panels/DiscussionPanel.tsx";
import { CartoonPanel } from "../panels/CartoonPanel.tsx";

const VALID_TABS = ["story", "discussion", "groups", "files", "cartoon"] as const;
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

const RISK_COLORS: Record<string, string> = {
	low: "bg-green-500/10 text-green-600 dark:text-green-400",
	medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
	high: "bg-red-500/10 text-red-600 dark:text-red-400",
	critical: "bg-red-500/20 text-red-700 dark:text-red-300",
};

export function ResultsScreen({
	data,
	onBack,
	activeId,
	onAnchorClick,
	cartoonEnabled,
	sessionId,
}: {
	data: NewprOutput;
	onBack: () => void;
	activeId: string | null;
	onAnchorClick: (kind: "group" | "file", id: string) => void;
	cartoonEnabled?: boolean;
	sessionId?: string | null;
}) {
	const { meta, summary } = data;
	const [tab, setTab] = useState<TabValue>(getInitialTab);

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
	}, []);

	const repoSlug = meta.pr_url.replace(/^https?:\/\/github\.com\//, "").replace(/\/pull\//, "#");

	return (
		<Tabs value={tab} onValueChange={handleTabChange} className="flex flex-col">
			<div ref={stickyRef} className="sticky top-0 z-10 bg-background pb-2 -mx-10 px-10">
				<div ref={collapsibleRef} className="overflow-hidden transition-[max-height,opacity] duration-200">
					<div className="pb-3 pt-1">
						<div className="flex items-center gap-3 mb-3">
							<Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={onBack}>
								<ArrowLeft className="h-4 w-4" />
							</Button>
							<a
								href={meta.pr_url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
							>
								{repoSlug}
							</a>
							<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_COLORS[summary.risk_level] ?? RISK_COLORS.medium}`}>
								{summary.risk_level}
							</span>
						</div>

						<h1 className="text-lg font-bold tracking-tight mb-2 line-clamp-2">{meta.pr_title}</h1>

						<div className="flex flex-wrap gap-x-4 gap-y-1">
							<a
								href={meta.author_url ?? `https://github.com/${meta.author}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								{meta.author_avatar ? (
									<img src={meta.author_avatar} alt={meta.author} className="h-3.5 w-3.5 rounded-full" />
								) : (
									<User className="h-3 w-3" />
								)}
								<span>{meta.author}</span>
							</a>
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<GitBranch className="h-3 w-3" />
								<span className="font-mono">{meta.base_branch}</span>
								<span className="text-muted-foreground/50">←</span>
								<span className="font-mono">{meta.head_branch}</span>
							</div>
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Files className="h-3 w-3" />
								<span className="text-green-500">+{meta.total_additions}</span>
								<span className="text-red-500">−{meta.total_deletions}</span>
								<span className="text-muted-foreground/50">·</span>
								<span>{meta.total_files_changed} files</span>
							</div>
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Bot className="h-3 w-3" />
								<span>{meta.model_used.split("/").pop()}</span>
							</div>
						</div>
					</div>
				</div>

				<div ref={compactRef} className="overflow-hidden transition-[max-height,opacity] duration-200" style={{ maxHeight: 0, opacity: 0 }}>
					<div className="flex items-center gap-3 min-w-0 pb-2">
						<Button variant="ghost" size="icon" className="shrink-0 -ml-2 h-7 w-7" onClick={onBack}>
							<ArrowLeft className="h-3.5 w-3.5" />
						</Button>
						<span className="text-sm font-semibold truncate flex-1">{meta.pr_title}</span>
						<span className="text-xs text-muted-foreground font-mono shrink-0">{repoSlug}</span>
						<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${RISK_COLORS[summary.risk_level] ?? RISK_COLORS.medium}`}>
							{summary.risk_level}
						</span>
					</div>
				</div>

				<TabsList className="w-full justify-start overflow-x-auto">
					<TabsTrigger value="story" className="gap-1.5">
						<BookOpen className="h-3.5 w-3.5 shrink-0" />
						Story
					</TabsTrigger>
					<TabsTrigger value="discussion" className="gap-1.5">
						<MessageSquare className="h-3.5 w-3.5 shrink-0" />
						Discussion
					</TabsTrigger>
					<TabsTrigger value="groups" className="gap-1.5">
						<Layers className="h-3.5 w-3.5 shrink-0" />
						Groups
					</TabsTrigger>
					<TabsTrigger value="files" className="gap-1.5">
						<FolderTree className="h-3.5 w-3.5 shrink-0" />
						Files
					</TabsTrigger>
					{cartoonEnabled && (
						<TabsTrigger value="cartoon" className="gap-1.5">
							<Sparkles className="h-3.5 w-3.5 shrink-0" />
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
			{cartoonEnabled && (
				<TabsContent value="cartoon">
					<CartoonPanel data={data} sessionId={sessionId} />
				</TabsContent>
			)}
		</Tabs>
	);
}
