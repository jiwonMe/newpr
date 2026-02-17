import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import type { NewprOutput } from "../../../types/output.ts";

export function StoryPanel({ data }: { data: NewprOutput }) {
	const { summary, groups, narrative } = data;

	const previewLines = narrative.split("\n").filter((l) => l.trim()).slice(0, 8);

	return (
		<div className="space-y-4 pt-4">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Overview</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-sm leading-relaxed">{summary.purpose}</p>
					<div className="flex flex-wrap gap-2">
						{groups.map((g) => (
							<span key={g.name} className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">
								{g.name}
							</span>
						))}
					</div>
				</CardContent>
			</Card>

			<div className="grid grid-cols-2 gap-4">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm text-muted-foreground">Scope</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm">{summary.scope}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm text-muted-foreground">Impact</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm">{summary.impact}</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Narrative Preview</CardTitle>
				</CardHeader>
				<CardContent>
					{previewLines.map((line, i) => (
						<p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>
					))}
					{narrative.split("\n").length > 8 && (
						<p className="text-xs text-muted-foreground/60 mt-2 italic">
							...see Narrative tab for full text
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
