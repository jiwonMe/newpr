import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import type { PrSummary } from "../../../types/output.ts";

export function SummaryPanel({ summary }: { summary: PrSummary }) {
	return (
		<div className="grid gap-4 pt-4">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium text-muted-foreground">Purpose</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm leading-relaxed">{summary.purpose}</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium text-muted-foreground">Scope</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm leading-relaxed">{summary.scope}</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium text-muted-foreground">Impact</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm leading-relaxed">{summary.impact}</p>
				</CardContent>
			</Card>
		</div>
	);
}
