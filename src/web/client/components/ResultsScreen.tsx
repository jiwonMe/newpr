import { useState, useRef, useEffect } from "react";
import { ArrowLeft, FileText, Layers, FolderTree, BookOpen, LayoutList, GitBranch, User, Files, Bot } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs.tsx";
import type { NewprOutput } from "../../../types/output.ts";
import { SummaryPanel } from "../panels/SummaryPanel.tsx";
import { GroupsPanel } from "../panels/GroupsPanel.tsx";
import { FilesPanel } from "../panels/FilesPanel.tsx";
import { NarrativePanel } from "../panels/NarrativePanel.tsx";
import { StoryPanel } from "../panels/StoryPanel.tsx";

const VALID_TABS = ["story", "summary", "groups", "files", "narrative"] as const;
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
}: {
	data: NewprOutput;
	onBack: () => void;
	activeId: string | null;
	onAnchorClick: (kind: "group" | "file", id: string) => void;
}) {
	const { meta, summary } = data;
	const [tab, setTab] = useState<TabValue>(getInitialTab);
	const [scrolled, setScrolled] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => setScrolled(!entry!.isIntersecting),
			{ threshold: 0 },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	function handleTabChange(value: string) {
		setTab(value as TabValue);
		setTabParam(value);
	}

	const repoSlug = meta.pr_url.replace(/^https?:\/\/github\.com\//, "").replace(/\/pull\//, "#");

	return (
		<div className="flex flex-col">
			<div ref={sentinelRef} />

			<div className={`sticky top-0 z-10 bg-background transition-all ${scrolled ? "pb-3 pt-1 border-b" : "pb-6 pt-0"}`}>
				{!scrolled && (
					<>
						<div className="flex items-center gap-3 mb-4">
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

						<h1 className="text-2xl font-bold tracking-tight mb-5" style={{ textWrap: "balance" }}>{meta.pr_title}</h1>

						<div className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
							<a
								href={meta.author_url ?? `https://github.com/${meta.author}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								{meta.author_avatar ? (
									<img src={meta.author_avatar} alt={meta.author} className="h-4 w-4 rounded-full" />
								) : (
									<User className="h-3.5 w-3.5" />
								)}
								<span>{meta.author}</span>
							</a>
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<GitBranch className="h-3.5 w-3.5" />
								<span className="font-mono text-xs">{meta.base_branch}</span>
								<span className="text-muted-foreground/50">←</span>
								<span className="font-mono text-xs">{meta.head_branch}</span>
							</div>
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<Files className="h-3.5 w-3.5" />
								<span className="text-green-500">+{meta.total_additions}</span>
								<span className="text-red-500">−{meta.total_deletions}</span>
								<span className="text-muted-foreground/50">·</span>
								<span>{meta.total_files_changed} files</span>
							</div>
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<Bot className="h-3.5 w-3.5" />
								<span>{meta.model_used.split("/").pop()}</span>
							</div>
						</div>
					</>
				)}

				{scrolled && (
					<div className="flex items-center gap-3 min-w-0">
						<Button variant="ghost" size="icon" className="shrink-0 -ml-2 h-7 w-7" onClick={onBack}>
							<ArrowLeft className="h-3.5 w-3.5" />
						</Button>
						<span className="text-sm font-semibold truncate flex-1">{meta.pr_title}</span>
						<span className="text-xs text-muted-foreground font-mono shrink-0">{repoSlug}</span>
						<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${RISK_COLORS[summary.risk_level] ?? RISK_COLORS.medium}`}>
							{summary.risk_level}
						</span>
					</div>
				)}

				<Tabs value={tab} onValueChange={handleTabChange} className="w-full">
					<TabsList className="w-full justify-start overflow-x-auto">
						<TabsTrigger value="story" className="gap-1.5">
							<BookOpen className="h-3.5 w-3.5 shrink-0" />
							Story
						</TabsTrigger>
						<TabsTrigger value="summary" className="gap-1.5">
							<LayoutList className="h-3.5 w-3.5 shrink-0" />
							Summary
						</TabsTrigger>
						<TabsTrigger value="groups" className="gap-1.5">
							<Layers className="h-3.5 w-3.5 shrink-0" />
							Groups
						</TabsTrigger>
						<TabsTrigger value="files" className="gap-1.5">
							<FolderTree className="h-3.5 w-3.5 shrink-0" />
							Files
						</TabsTrigger>
						<TabsTrigger value="narrative" className="gap-1.5">
							<FileText className="h-3.5 w-3.5 shrink-0" />
							Narrative
						</TabsTrigger>
					</TabsList>

					<TabsContent value="story">
						<StoryPanel data={data} activeId={activeId} onAnchorClick={onAnchorClick} />
					</TabsContent>
					<TabsContent value="summary">
						<SummaryPanel summary={data.summary} />
					</TabsContent>
					<TabsContent value="groups">
						<GroupsPanel groups={data.groups} />
					</TabsContent>
					<TabsContent value="files">
						<FilesPanel files={data.files} />
					</TabsContent>
					<TabsContent value="narrative">
						<NarrativePanel narrative={data.narrative} />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
