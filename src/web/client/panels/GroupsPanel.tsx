import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FileGroup } from "../../../types/output.ts";

const TYPE_COLORS: Record<string, string> = {
	feature: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	refactor: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
	bugfix: "bg-red-500/10 text-red-600 dark:text-red-400",
	chore: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
	docs: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
	test: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
	config: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export function GroupsPanel({ groups }: { groups: FileGroup[] }) {
	const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

	function toggle(idx: number) {
		setExpanded((s) => {
			const next = new Set(s);
			next.has(idx) ? next.delete(idx) : next.add(idx);
			return next;
		});
	}

	return (
		<div className="pt-6 divide-y">
			{groups.map((group, i) => (
				<div key={group.name}>
					<button
						type="button"
						className="w-full flex items-center gap-3 min-w-0 py-4 text-left hover:bg-accent/30 transition-colors -mx-2 px-2 rounded-md"
						onClick={() => toggle(i)}
					>
						{expanded.has(i) ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
						)}
						<span className="text-sm font-medium flex-1 min-w-0 truncate">{group.name}</span>
						<span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[group.type] ?? TYPE_COLORS.chore}`}>
							{group.type}
						</span>
						<span className="text-xs text-muted-foreground shrink-0">{group.files.length} files</span>
					</button>
					{expanded.has(i) && (
						<div className="pb-4 pl-8">
							<p className="text-sm text-muted-foreground mb-3 break-words">{group.description}</p>
							<div className="space-y-1">
								{group.files.map((f) => (
									<div key={f} className="text-xs font-mono text-muted-foreground pl-2 border-l-2 border-border truncate" title={f}>
										{f}
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
