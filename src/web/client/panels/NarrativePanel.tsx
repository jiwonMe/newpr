import { Card, CardContent } from "../../components/ui/card.tsx";

function renderInline(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const regex = /\[\[(group|file):([^\]]+)\]\]|`([^`]+)`/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		if (match[1] === "group") {
			parts.push(
				<span key={match.index} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">
					{match[2]}
				</span>,
			);
		} else if (match[1] === "file") {
			parts.push(
				<code key={match.index} className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
					{match[2]}
				</code>,
			);
		} else if (match[3]) {
			parts.push(
				<code key={match.index} className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
					{match[3]}
				</code>,
			);
		}
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

export function NarrativePanel({ narrative }: { narrative: string }) {
	return (
		<Card className="mt-4">
			<CardContent className="max-w-none p-6 space-y-4">
				{narrative.split("\n").map((line, i) => {
					if (!line.trim()) return null;
					if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold mt-6 mb-3 break-words">{line.slice(2)}</h1>;
					if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-semibold mt-6 mb-2 break-words">{line.slice(3)}</h2>;
					if (line.startsWith("### ")) return <h3 key={i} className="text-base font-medium mt-4 mb-1 break-words">{line.slice(4)}</h3>;
					if (line.startsWith("- ")) return <li key={i} className="text-sm text-muted-foreground ml-4 break-words">{renderInline(line.slice(2))}</li>;
					return <p key={i} className="text-sm leading-relaxed text-foreground/90 break-words">{renderInline(line)}</p>;
				})}
			</CardContent>
		</Card>
	);
}
