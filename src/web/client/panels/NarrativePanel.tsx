import { Card, CardContent } from "../../components/ui/card.tsx";

export function NarrativePanel({ narrative }: { narrative: string }) {
	return (
		<Card className="mt-4">
			<CardContent className="prose prose-sm dark:prose-invert max-w-none p-6">
				{narrative.split("\n").map((line, i) => {
					if (!line.trim()) return <br key={i} />;
					if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-semibold mt-6 mb-2">{line.slice(3)}</h2>;
					if (line.startsWith("### ")) return <h3 key={i} className="text-base font-medium mt-4 mb-1">{line.slice(4)}</h3>;
					if (line.startsWith("- ")) return <li key={i} className="text-sm text-muted-foreground ml-4">{line.slice(2)}</li>;
					return <p key={i} className="text-sm leading-relaxed text-foreground/90">{line}</p>;
				})}
			</CardContent>
		</Card>
	);
}
