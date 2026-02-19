import { ChevronRight, GitBranch, ExternalLink, Plus, Minus, GitMerge } from "lucide-react";
import { useState } from "react";
import type { StackGroupStats } from "../../../stack/types.ts";

const TYPE_COLORS: Record<string, { dot: string; badge: string; text: string }> = {
	feature:  { dot: "bg-blue-500",    badge: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400" },
	refactor: { dot: "bg-purple-500",  badge: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400" },
	bugfix:   { dot: "bg-red-500",     badge: "bg-red-500/10",     text: "text-red-600 dark:text-red-400" },
	chore:    { dot: "bg-neutral-400", badge: "bg-neutral-500/10", text: "text-neutral-500" },
	docs:     { dot: "bg-teal-500",    badge: "bg-teal-500/10",    text: "text-teal-600 dark:text-teal-400" },
	test:     { dot: "bg-yellow-500",  badge: "bg-yellow-500/10",  text: "text-yellow-600 dark:text-yellow-400" },
	config:   { dot: "bg-orange-500",  badge: "bg-orange-500/10",  text: "text-orange-600 dark:text-orange-400" },
};

function formatStat(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

export interface DagGroup {
	id: string;
	name: string;
	type: string;
	description: string;
	files: string[];
	deps: string[];
	order: number;
	stats?: StackGroupStats;
	pr_title?: string;
}

interface DagCommit {
	group_id: string;
	commit_sha: string;
	branch_name: string;
}

interface DagPr {
	group_id: string;
	number: number;
	url: string;
	title: string;
}

interface DagNode {
	group: DagGroup;
	indent: number;
	isLastChild: boolean;
	parentId: string | null;
	childIds: string[];
}

function buildDagNodes(groups: DagGroup[]): DagNode[] {
	const byId = new Map(groups.map((g) => [g.id, g]));

	const childrenOf = new Map<string, string[]>();
	for (const g of groups) {
		for (const dep of (g.deps ?? [])) {
			if (!byId.has(dep)) continue;
			const arr = childrenOf.get(dep) ?? [];
			arr.push(g.id);
			childrenOf.set(dep, arr);
		}
	}

	const hasIncomingEdge = new Set<string>();
	for (const g of groups) {
		for (const dep of (g.deps ?? [])) {
			if (byId.has(dep)) hasIncomingEdge.add(g.id);
		}
	}

	const roots = groups.filter((g) => !hasIncomingEdge.has(g.id)).sort((a, b) => a.order - b.order);

	const result: DagNode[] = [];
	const visited = new Set<string>();

	const dfs = (id: string, indent: number, parentId: string | null, siblingIndex: number, siblingCount: number) => {
		if (visited.has(id)) return;
		visited.add(id);

		const g = byId.get(id)!;
		const children = (childrenOf.get(id) ?? []).sort((a, b) => {
			const ga = byId.get(a)!;
			const gb = byId.get(b)!;
			return ga.order - gb.order;
		});

		result.push({
			group: g,
			indent,
			isLastChild: siblingIndex === siblingCount - 1,
			parentId,
			childIds: children,
		});

		children.forEach((childId, i) => {
			dfs(childId, indent + 1, id, i, children.length);
		});
	};

	roots.forEach((root, i) => {
		dfs(root.id, 0, null, i, roots.length);
	});

	for (const g of groups) {
		if (!visited.has(g.id)) {
			result.push({
				group: g,
				indent: 0,
				isLastChild: true,
				parentId: null,
				childIds: childrenOf.get(g.id) ?? [],
			});
		}
	}

	return result;
}


const INDENT = 16;
const DOT_OFFSET = 8;

function DagNodeCard({
	node,
	commit,
	pr,
	allGroups,
}: {
	node: DagNode;
	commit?: DagCommit;
	pr?: DagPr;
	allGroups: DagGroup[];
}) {
	const [expanded, setExpanded] = useState(false);
	const { group, indent: level } = node;
	const stats = group.stats;
	const colors = TYPE_COLORS[group.type] ?? TYPE_COLORS.chore!;

	const depNames = (group.deps ?? []).map((depId) => {
		const found = allGroups.find((g) => g.id === depId);
		return found?.pr_title ?? found?.name ?? depId;
	});

	return (
		<div className="flex items-start min-w-0">
			{Array.from({ length: level }).map((_, i) => (
				<div
					key={i}
					className="shrink-0 relative"
					style={{ width: INDENT }}
				>
					<div
						className="absolute top-0 bottom-0 border-l border-border/20"
						style={{ left: DOT_OFFSET }}
					/>
					{i === level - 1 && (
						<div
							className="absolute h-px bg-border/20"
							style={{ left: DOT_OFFSET, right: 0, top: 18 }}
						/>
					)}
				</div>
			))}

			<div className="flex-1 min-w-0">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="w-full flex items-start gap-2 px-2 py-2 text-left hover:bg-accent/20 transition-colors rounded-md"
				>
					<div className="shrink-0 mt-[5px]">
						<div className={`h-[7px] w-[7px] rounded-full ${colors.dot} ring-[1.5px] ring-background`} />
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5 flex-wrap">
							<span className={`text-[9px] font-medium px-1.5 py-px rounded ${colors.badge} ${colors.text} shrink-0 leading-none`}>
								{group.type}
							</span>
							<span className="text-[11.5px] font-medium text-foreground/90 truncate">
								{group.pr_title ?? group.name}
							</span>
						</div>

						{depNames.length > 0 && level > 0 && (
							<div className="flex items-center gap-1 mt-[2px]">
								<span className="text-[9px] text-muted-foreground/20">↳</span>
								<span className="text-[9px] text-muted-foreground/25 truncate">
									{depNames.join(", ")}
								</span>
							</div>
						)}
					</div>

					<div className="shrink-0 flex items-center gap-2 mt-[3px]">
						{stats ? (
							<span className="flex items-center gap-1.5">
								<span className="text-[10px] text-green-600/60 dark:text-green-400/60 tabular-nums">
									+{formatStat(stats.additions)}
								</span>
								<span className="text-[10px] text-red-500/60 tabular-nums">
									−{formatStat(stats.deletions)}
								</span>
							</span>
						) : (
							<span className="text-[9px] text-muted-foreground/20 tabular-nums">{group.files.length}f</span>
						)}
						<ChevronRight className={`h-3 w-3 text-muted-foreground/20 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
					</div>
				</button>

				{expanded && (
					<div className="ml-[15px] pl-3 pb-3 pt-1 space-y-2 border-l border-border/20">
						{group.description && (
							<p className="text-[10.5px] text-muted-foreground/45 leading-[1.55]">{group.description}</p>
						)}

						{stats && (
							<div className="flex items-center gap-3 text-[9.5px] text-muted-foreground/30 tabular-nums">
								<span>{group.files.length} files</span>
								<span className="flex items-center gap-0.5">
									<Plus className="h-2 w-2 text-green-600/50 dark:text-green-400/50" />
									{stats.additions.toLocaleString()}
								</span>
								<span className="flex items-center gap-0.5">
									<Minus className="h-2 w-2 text-red-500/50" />
									{stats.deletions.toLocaleString()}
								</span>
								{(stats.files_added > 0 || stats.files_modified > 0 || stats.files_deleted > 0) && (
									<span>
										{stats.files_added > 0 && `${stats.files_added}A `}
										{stats.files_modified > 0 && `${stats.files_modified}M `}
										{stats.files_deleted > 0 && `${stats.files_deleted}D`}
									</span>
								)}
							</div>
						)}

						{commit && (
							<div className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground/25">
								<GitBranch className="h-2.5 w-2.5 shrink-0" />
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
								className="inline-flex items-center gap-1 text-[9.5px] text-foreground/40 hover:text-foreground/70 transition-colors"
							>
								<ExternalLink className="h-2.5 w-2.5 shrink-0" />
								<span className="tabular-nums">#{pr.number}</span>
								<span className="truncate max-w-[180px]">{pr.title}</span>
							</a>
						)}

						<div className="space-y-0 pt-0.5">
							{group.files.map((file) => (
								<div key={file} className="text-[9px] font-mono text-muted-foreground/20 py-[1px] truncate">
									{file}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export function StackDagView({
	groups,
	groupCommits,
	publishedPrs,
}: {
	groups: DagGroup[];
	groupCommits?: DagCommit[];
	publishedPrs?: DagPr[];
}) {
	const nodes = buildDagNodes(groups);
	const isLinear = nodes.every((n) => n.indent === 0);

	return (
		<div className="relative">
			{!isLinear && (
				<div className="flex items-center gap-1.5 mb-2 px-1">
					<GitMerge className="h-3 w-3 text-muted-foreground/25" />
					<span className="text-[9px] text-muted-foreground/25 uppercase tracking-wider">DAG</span>
				</div>
			)}

			<div className="relative space-y-0.5">
				{nodes.map((node) => {
					const commit = groupCommits?.find((c) => c.group_id === node.group.id);
					const pr = publishedPrs?.find((p) => p.group_id === node.group.id);
					return (
						<DagNodeCard
							key={node.group.id}
							node={node}
							commit={commit}
							pr={pr}
							allGroups={groups}
						/>
					);
				})}

				{nodes.length > 0 && (
					<div
						className="absolute top-[14px] bottom-[14px] w-px bg-border/15 pointer-events-none"
						style={{ left: "8px" }}
					/>
				)}
			</div>
		</div>
	);
}
