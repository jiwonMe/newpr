import type { NewprOutput } from "../../../types/output.ts";
import { Markdown } from "../components/Markdown.tsx";
import { ChatMessages } from "../components/ChatSection.tsx";

const TYPE_DOT: Record<string, string> = {
	feature: "bg-blue-500",
	refactor: "bg-purple-500",
	bugfix: "bg-red-500",
	chore: "bg-neutral-400",
	docs: "bg-teal-500",
	test: "bg-yellow-500",
	config: "bg-orange-500",
};

export function StoryPanel({
	data,
	activeId,
	onAnchorClick,
}: {
	data: NewprOutput;
	activeId: string | null;
	onAnchorClick: (kind: "group" | "file" | "line", id: string) => void;
}) {
	const { summary, groups, narrative } = data;

	return (
		<div className="pt-5 space-y-6">
			<div className="space-y-4">
			<p className="text-sm text-foreground/80 leading-relaxed">{summary.purpose}</p>

			<div className="grid grid-cols-2 gap-x-6 gap-y-3">
				<div>
					<div className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-1">Scope</div>
					<p className="text-sm text-muted-foreground/70 leading-relaxed">{summary.scope}</p>
				</div>
				<div>
					<div className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-1">Impact</div>
					<p className="text-sm text-muted-foreground/70 leading-relaxed">{summary.impact}</p>
				</div>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{groups.map((g) => {
					const isActive = activeId === `group:${g.name}`;
					return (
						<button
							key={g.name}
							type="button"
							onClick={() => onAnchorClick("group", g.name)}
							className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md transition-colors ${
								isActive
									? "bg-accent text-foreground font-medium"
									: "text-muted-foreground/60 hover:text-foreground hover:bg-accent/40"
							}`}
						>
								<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_DOT[g.type] ?? TYPE_DOT.chore}`} />
								{g.name}
							</button>
						);
					})}
				</div>
			</div>

			<div className="border-t pt-5">
				<div className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-4">Walkthrough</div>
				<Markdown onAnchorClick={onAnchorClick} activeId={activeId}>
					{narrative}
				</Markdown>
			</div>

			<ChatMessages onAnchorClick={onAnchorClick} activeId={activeId} />
		</div>
	);
}
