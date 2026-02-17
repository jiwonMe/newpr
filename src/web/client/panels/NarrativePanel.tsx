import { Markdown } from "../components/Markdown.tsx";

export function NarrativePanel({ narrative }: { narrative: string }) {
	return (
		<div className="pt-6">
			<Markdown>{narrative}</Markdown>
		</div>
	);
}
