import { ChevronRight, GitBranch, ExternalLink, Plus, Minus } from "lucide-react";
import { useState } from "react";
import type { StackGroupStats } from "../../../stack/types.ts";

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	feature: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
	refactor: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
	bugfix: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
	chore: { bg: "bg-neutral-500/10", text: "text-neutral-500" },
	docs: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
	test: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400" },
	config: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
};

function formatStat(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

function SizeBar({ stats }: { stats: StackGroupStats }) {
	const total = stats.additions + stats.deletions;
	if (total === 0) return null;
	const addPct = Math.round((stats.additions / total) * 100);
	const segments = 5;
	const addSegs = Math.round((addPct / 100) * segments);
	const delSegs = segments - addSegs;

	return (
		<div className="flex items-center gap-[2px]">
			{Array.from({ length: addSegs }).map((_, i) => (
				<div key={`a${i}`} className="h-[6px] w-[6px] rounded-[1px] bg-green-500/70" />
			))}
			{Array.from({ length: delSegs }).map((_, i) => (
				<div key={`d${i}`} className="h-[6px] w-[6px] rounded-[1px] bg-red-500/70" />
			))}
		</div>
	);
}

interface StackGroupCardProps {
	group: {
		id: string;
		name: string;
		type: string;
		description: string;
		files: string[];
		order: number;
		deps?: string[];
		stats?: StackGroupStats;
		pr_title?: string;
	};
	commit?: {
		commit_sha: string;
		branch_name: string;
	};
	pr?: {
		number: number;
		url: string;
		title: string;
	};
	allGroups?: Array<{ id: string; name: string; pr_title?: string }>;
}

export function StackGroupCard({ group, commit, pr, allGroups }: StackGroupCardProps) {
	const [expanded, setExpanded] = useState(false);
	const stats = group.stats;
	const colors = TYPE_COLORS[group.type] ?? TYPE_COLORS.chore!;
	const hasDeps = (group.deps ?? []).length > 0;
	const depNames = (group.deps ?? []).map((depId) => {
		const found = allGroups?.find((g) => g.id === depId);
		return found?.pr_title ?? found?.name ?? depId;
	});

	return (
		<div className="group/card">
			{hasDeps && (
				<div className="ml-[26px] px-3 pb-0.5 flex items-center gap-1.5 flex-wrap">
					{depNames.map((name, i) => (
						<span key={i} className="text-[9px] text-muted-foreground/25 font-mono leading-none">↑ {name}</span>
					))}
				</div>
			)}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/20 transition-colors rounded-md"
			>
				<span className="text-[10px] text-muted-foreground/20 tabular-nums w-4 shrink-0 text-right">
					{group.order + 1}
				</span>

				<ChevronRight className={`h-3 w-3 text-muted-foreground/25 shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />

				<span className={`text-[9px] font-medium px-1.5 py-px rounded ${colors.bg} ${colors.text} shrink-0`}>
					{group.type}
				</span>

				<span className="text-[12px] font-medium flex-1 min-w-0 truncate text-foreground/90">
					{group.pr_title ?? group.name}
				</span>

				{stats ? (
					<span className="flex items-center gap-2 shrink-0">
						<span className="text-[10px] text-green-600/70 dark:text-green-400/70 tabular-nums">
							+{formatStat(stats.additions)}
						</span>
						<span className="text-[10px] text-red-500/70 tabular-nums">
							−{formatStat(stats.deletions)}
						</span>
						<SizeBar stats={stats} />
					</span>
				) : (
					<span className="text-[10px] text-muted-foreground/25 shrink-0 tabular-nums">
						{group.files.length}f
					</span>
				)}
			</button>

			{expanded && (
				<div className="ml-[26px] pl-5 pb-3 space-y-2.5 border-l border-border/50">
					{group.pr_title && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-muted-foreground/30">{group.name}</span>
						</div>
					)}

					<p className="text-[11px] text-muted-foreground/50 leading-[1.6]">
						{group.description}
					</p>

					{stats && (
						<div className="flex items-center gap-4 text-[10px]">
							<span className="text-muted-foreground/30 tabular-nums">
								{group.files.length} files
							</span>
							<span className="flex items-center gap-1">
								<Plus className="h-2.5 w-2.5 text-green-600/60 dark:text-green-400/60" />
								<span className="tabular-nums text-green-600/60 dark:text-green-400/60">{stats.additions.toLocaleString()}</span>
							</span>
							<span className="flex items-center gap-1">
								<Minus className="h-2.5 w-2.5 text-red-500/60" />
								<span className="tabular-nums text-red-500/60">{stats.deletions.toLocaleString()}</span>
							</span>
							<span className="text-muted-foreground/20 tabular-nums">
								{stats.files_added > 0 && `${stats.files_added}A `}
								{stats.files_modified > 0 && `${stats.files_modified}M `}
								{stats.files_deleted > 0 && `${stats.files_deleted}D`}
							</span>
						</div>
					)}

					{commit && (
						<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30">
							<GitBranch className="h-3 w-3 shrink-0" />
							<span className="font-mono truncate">{commit.branch_name}</span>
							<span className="text-muted-foreground/15">·</span>
							<span className="font-mono shrink-0">{commit.commit_sha.slice(0, 7)}</span>
						</div>
					)}

					{pr && (
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-[10px] text-foreground/50 hover:text-foreground transition-colors"
						>
							<ExternalLink className="h-3 w-3 shrink-0" />
							<span className="tabular-nums">#{pr.number}</span>
							<span className="truncate">{pr.title}</span>
						</a>
					)}

					<div className="space-y-0">
						{group.files.map((file) => (
							<div key={file} className="text-[10px] font-mono text-muted-foreground/25 py-[2px] truncate">
								{file}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
