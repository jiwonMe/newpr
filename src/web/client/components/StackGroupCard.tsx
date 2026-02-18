import { ChevronRight, GitBranch, ExternalLink } from "lucide-react";
import { useState } from "react";

const TYPE_DOT: Record<string, string> = {
	feature: "bg-blue-500",
	refactor: "bg-purple-500",
	bugfix: "bg-red-500",
	chore: "bg-neutral-400",
	docs: "bg-teal-500",
	test: "bg-yellow-500",
	config: "bg-orange-500",
};

interface StackGroupCardProps {
	group: {
		id: string;
		name: string;
		type: string;
		description: string;
		files: string[];
		order: number;
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
}

export function StackGroupCard({ group, commit, pr }: StackGroupCardProps) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-accent/30 transition-colors rounded-lg"
			>
				<span className="text-[10px] font-mono text-muted-foreground/30 tabular-nums w-5 shrink-0">
					{group.order + 1}
				</span>
				<ChevronRight className={`h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
				<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_DOT[group.type] ?? TYPE_DOT.chore}`} />
				<span className="text-xs font-medium flex-1 min-w-0 truncate">{group.name}</span>
				<span className="text-[10px] text-muted-foreground/30 shrink-0">{group.type}</span>
				<span className="text-[10px] text-muted-foreground/30 shrink-0 tabular-nums">{group.files.length} files</span>
			</button>
			{expanded && (
				<div className="px-3.5 pb-3 pt-0 space-y-2 border-t">
					<p className="text-[11px] text-muted-foreground/60 leading-relaxed pt-2">{group.description}</p>

					{commit && (
						<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
							<GitBranch className="h-3 w-3 shrink-0" />
							<span className="font-mono">{commit.branch_name}</span>
							<span className="text-muted-foreground/25">·</span>
							<span className="font-mono">{commit.commit_sha.slice(0, 8)}</span>
						</div>
					)}

					{pr && (
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
						>
							<ExternalLink className="h-3 w-3 shrink-0" />
							<span>#{pr.number} {pr.title}</span>
						</a>
					)}

					<div className="space-y-px">
						{group.files.map((file) => (
							<div key={file} className="text-[10px] font-mono text-muted-foreground/40 pl-1.5 py-0.5">
								{file}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
