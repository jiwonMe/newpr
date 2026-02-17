import type { PrSummary } from "../../../types/output.ts";

export function SummaryPanel({ summary }: { summary: PrSummary }) {
	return (
		<div className="pt-6 divide-y">
			<div className="pb-6">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Purpose</h3>
				<p className="text-sm leading-relaxed">{summary.purpose}</p>
			</div>
			<div className="py-6">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Scope</h3>
				<p className="text-sm leading-relaxed">{summary.scope}</p>
			</div>
			<div className="pt-6">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Impact</h3>
				<p className="text-sm leading-relaxed">{summary.impact}</p>
			</div>
		</div>
	);
}
