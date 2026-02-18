import { CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { FeasibilityResult } from "../../../stack/types.ts";

export function FeasibilityAlert({ result }: { result: FeasibilityResult }) {
	const [expanded, setExpanded] = useState(false);

	if (result.feasible) {
		return (
			<div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/[0.04]">
				<CheckCircle2 className="h-3.5 w-3.5 text-green-600/60 dark:text-green-400/60 shrink-0" />
				<span className="text-[11px] text-green-700/70 dark:text-green-300/70 font-medium">Feasible</span>
				{result.ordered_group_ids && (
					<span className="text-[10px] text-muted-foreground/25 truncate">
						{result.ordered_group_ids.join(" → ")}
					</span>
				)}
			</div>
		);
	}

	const hasCycleDetails = result.cycle && result.cycle.edge_cycle.length > 0;

	return (
		<div className="rounded-md bg-red-500/[0.04] px-3 py-2.5 space-y-2">
			<button
				type="button"
				onClick={() => hasCycleDetails && setExpanded(!expanded)}
				className={`flex items-center gap-2 w-full text-left ${hasCycleDetails ? "cursor-pointer" : "cursor-default"}`}
			>
				<XCircle className="h-3.5 w-3.5 text-red-500/60 shrink-0" />
				<span className="text-[11px] text-red-600/80 dark:text-red-400/80 font-medium flex-1">
					Not feasible — dependency cycle
				</span>
				{hasCycleDetails && (
					<ChevronRight className={`h-3 w-3 text-red-500/30 shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
				)}
			</button>

			{result.cycle && (
				<p className="text-[10px] text-red-500/50 pl-5.5">
					{result.cycle.group_cycle.join(" → ")} → {result.cycle.group_cycle[0]}
				</p>
			)}

			{expanded && result.cycle && (
				<div className="pl-5.5 space-y-1">
					{result.cycle.edge_cycle.map((edge, i) => (
						<div key={i} className="text-[10px] text-red-500/40">
							{edge.from} → {edge.to}
							<span className="text-red-500/25"> ({edge.kind}{edge.evidence?.path ? `: ${edge.evidence.path}` : ""})</span>
						</div>
					))}
				</div>
			)}

			{result.unassigned_paths && result.unassigned_paths.length > 0 && (
				<p className="text-[10px] text-red-500/40 pl-5.5">
					{result.unassigned_paths.length} unassigned file(s)
				</p>
			)}
		</div>
	);
}
