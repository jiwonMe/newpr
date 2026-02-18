import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { FeasibilityResult } from "../../../stack/types.ts";

export function FeasibilityAlert({ result }: { result: FeasibilityResult }) {
	if (result.feasible) {
		return (
			<div className="flex items-start gap-2.5 rounded-lg border border-green-500/20 bg-green-500/5 px-3.5 py-2.5">
				<CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
				<div>
					<p className="text-[11px] font-medium text-green-700 dark:text-green-300">
						Stacking is feasible
					</p>
					{result.ordered_group_ids && (
						<p className="text-[10px] text-green-600/60 dark:text-green-400/60 mt-0.5">
							Order: {result.ordered_group_ids.join(" → ")}
						</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 space-y-2">
			<div className="flex items-start gap-2.5">
				<XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
				<p className="text-[11px] font-medium text-red-700 dark:text-red-300">
					Stacking is not feasible
				</p>
			</div>
			{result.cycle && (
				<div className="pl-6 space-y-1">
					<p className="text-[10px] text-red-600/70 dark:text-red-400/70">
						Cycle: {result.cycle.group_cycle.join(" → ")} → {result.cycle.group_cycle[0]}
					</p>
					{result.cycle.edge_cycle.map((edge, i) => (
						<div key={i} className="flex items-center gap-1.5 text-[10px] text-red-500/50">
							<AlertTriangle className="h-2.5 w-2.5 shrink-0" />
							<span>
								{edge.from} → {edge.to} ({edge.kind}{edge.evidence?.path ? `: ${edge.evidence.path}` : ""})
							</span>
						</div>
					))}
				</div>
			)}
			{result.unassigned_paths && result.unassigned_paths.length > 0 && (
				<div className="pl-6">
					<p className="text-[10px] text-red-600/70 dark:text-red-400/70">
						{result.unassigned_paths.length} unassigned file(s)
					</p>
				</div>
			)}
		</div>
	);
}
