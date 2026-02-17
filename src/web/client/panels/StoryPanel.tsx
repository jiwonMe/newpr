import type { NewprOutput } from "../../../types/output.ts";
import { Markdown } from "../components/Markdown.tsx";

export function StoryPanel({
	data,
	activeId,
	onAnchorClick,
}: {
	data: NewprOutput;
	activeId: string | null;
	onAnchorClick: (kind: "group" | "file", id: string) => void;
}) {
	const { summary, groups, narrative } = data;

	return (
		<div className="pt-4 space-y-5">
			<div className="space-y-3">
				<p className="text-xs text-muted-foreground leading-relaxed">{summary.purpose}</p>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Scope</span>
						<p className="text-xs text-muted-foreground mt-0.5">{summary.scope}</p>
					</div>
					<div>
						<span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Impact</span>
						<p className="text-xs text-muted-foreground mt-0.5">{summary.impact}</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{groups.map((g) => (
						<button
							key={g.name}
							type="button"
							onClick={() => onAnchorClick("group", g.name)}
							className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${
								activeId === `group:${g.name}`
									? "bg-blue-500/20 text-blue-500 dark:text-blue-300 ring-1 ring-blue-500/40"
									: "bg-muted hover:bg-muted/80"
							}`}
						>
							{g.name}
						</button>
					))}
				</div>
			</div>

			<div className="border-t pt-5">
				<Markdown onAnchorClick={onAnchorClick} activeId={activeId}>
					{narrative}
				</Markdown>
			</div>
		</div>
	);
}
