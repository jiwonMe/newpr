import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FileGroup } from "../../../types/output.ts";

const TYPE_DOT: Record<string, string> = {
	feature: "bg-blue-500",
	refactor: "bg-purple-500",
	bugfix: "bg-red-500",
	chore: "bg-neutral-400",
	docs: "bg-teal-500",
	test: "bg-yellow-500",
	config: "bg-orange-500",
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
		<div className="pt-5">
			<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-3">
				{groups.length} groups
			</div>
			<div className="space-y-px">
				{groups.map((group, i) => {
					const isOpen = expanded.has(i);
					return (
						<div key={group.name}>
							<button
								type="button"
								className={`w-full flex items-center gap-2.5 py-2.5 px-2.5 -mx-1 text-left rounded-lg transition-colors ${
									isOpen ? "bg-accent/50" : "hover:bg-accent/30"
								}`}
								onClick={() => toggle(i)}
							>
								<ChevronRight className={`h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
								<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_DOT[group.type] ?? TYPE_DOT.chore}`} />
								<span className="text-xs font-medium flex-1 min-w-0 truncate">{group.name}</span>
								<span className="text-[10px] text-muted-foreground/30 shrink-0">{group.type}</span>
								<span className="text-[10px] text-muted-foreground/30 shrink-0 tabular-nums">{group.files.length}</span>
							</button>
							{isOpen && (
								<div className="pl-[34px] pr-2 pb-3 pt-1">
									<p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-2.5">{group.description}</p>
									<div className="space-y-0.5">
										{group.files.map((f) => (
											<div
												key={f}
												className="text-[11px] font-mono text-muted-foreground/50 truncate py-0.5"
												title={f}
											>
												{f}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
