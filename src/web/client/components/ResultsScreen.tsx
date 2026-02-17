import { ArrowLeft, FileText, Layers, FolderTree, BookOpen, LayoutList } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs.tsx";
import type { NewprOutput } from "../../../types/output.ts";
import { SummaryPanel } from "../panels/SummaryPanel.tsx";
import { GroupsPanel } from "../panels/GroupsPanel.tsx";
import { FilesPanel } from "../panels/FilesPanel.tsx";
import { NarrativePanel } from "../panels/NarrativePanel.tsx";
import { StoryPanel } from "../panels/StoryPanel.tsx";

const RISK_COLORS: Record<string, string> = {
	low: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
	medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
	high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
	critical: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
};

export function ResultsScreen({ data, onBack }: { data: NewprOutput; onBack: () => void }) {
	const { meta, summary } = data;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start gap-4">
				<div className="flex flex-col gap-1 min-w-0 flex-1">
					<div className="flex items-center gap-3">
						<Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<h1 className="text-xl font-bold shrink-0">#{meta.pr_number}</h1>
						<span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${RISK_COLORS[summary.risk_level] ?? RISK_COLORS.medium}`}>
							{summary.risk_level}
						</span>
					</div>
					<p className="text-muted-foreground text-sm ml-12 truncate">{meta.pr_title}</p>
				</div>
				<div className="text-right text-xs text-muted-foreground space-y-0.5 shrink-0">
					<div className="truncate max-w-[280px]">{meta.author} · {meta.base_branch} ← {meta.head_branch}</div>
					<div>+{meta.total_additions} −{meta.total_deletions} · {meta.total_files_changed} files</div>
					<div>{meta.model_used.split("/").pop()}</div>
				</div>
			</div>

			<Tabs defaultValue="story" className="w-full">
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
					<StoryPanel data={data} />
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
	);
}
