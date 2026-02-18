import { useState } from "react";
import { ChevronRight, AlertTriangle, Info } from "lucide-react";
import type { StackWarning, StackWarningCategory } from "../../../stack/types.ts";

const CATEGORY_LABELS: Record<StackWarningCategory, string> = {
	assignment: "File Assignment",
	grouping: "Group Changes",
	coupling: "Coupling Rules",
	"verification.scope": "Scope Check",
	"verification.completeness": "Completeness Check",
	system: "System",
};

const CATEGORY_ORDER: StackWarningCategory[] = [
	"system",
	"assignment",
	"coupling",
	"grouping",
	"verification.scope",
	"verification.completeness",
];

function groupByCategory(warnings: StackWarning[]): Map<StackWarningCategory, StackWarning[]> {
	const map = new Map<StackWarningCategory, StackWarning[]>();
	for (const w of warnings) {
		const existing = map.get(w.category) ?? [];
		existing.push(w);
		map.set(w.category, existing);
	}
	return map;
}

function WarningGroup({ category, items, defaultOpen }: {
	category: StackWarningCategory;
	items: StackWarning[];
	defaultOpen: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultOpen);
	const hasWarn = items.some((w) => w.severity === "warn");

	return (
		<div>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/20 transition-colors rounded-md"
			>
				<ChevronRight className={`h-3 w-3 text-muted-foreground/20 shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
				{hasWarn
					? <AlertTriangle className="h-3 w-3 text-yellow-500/60 shrink-0" />
					: <Info className="h-3 w-3 text-muted-foreground/30 shrink-0" />
				}
				<span className="text-[11px] font-medium text-muted-foreground/50 flex-1">
					{CATEGORY_LABELS[category]}
				</span>
				<span className={`text-[9px] font-medium tabular-nums px-1.5 py-0.5 rounded-full ${
					hasWarn
						? "bg-yellow-500/8 text-yellow-600/70 dark:text-yellow-400/70"
						: "bg-foreground/[0.04] text-muted-foreground/30"
				}`}>
					{items.length}
				</span>
			</button>

			{expanded && (
				<div className="ml-5 pl-3 border-l border-border/40 space-y-1.5 pb-2">
					{items.map((w, i) => (
						<WarningItem key={i} warning={w} />
					))}
				</div>
			)}
		</div>
	);
}

function WarningItem({ warning }: { warning: StackWarning }) {
	const [detailsOpen, setDetailsOpen] = useState(false);
	const hasDetails = warning.details && warning.details.length > 0;

	return (
		<div className="py-1">
			<div className="flex items-start gap-1.5">
				<span className={`mt-[5px] h-1 w-1 rounded-full shrink-0 ${
					warning.severity === "warn" ? "bg-yellow-500/60" : "bg-muted-foreground/20"
				}`} />
				<div className="flex-1 min-w-0">
					<div className="text-[11px] font-medium text-foreground/60">{warning.title}</div>
					<div className="text-[10px] text-muted-foreground/35 leading-relaxed">{warning.message}</div>
					{hasDetails && (
						<button
							type="button"
							onClick={() => setDetailsOpen(!detailsOpen)}
							className="text-[10px] text-muted-foreground/25 hover:text-muted-foreground/50 mt-0.5 transition-colors"
						>
							{detailsOpen ? "Hide" : `${warning.details!.length} details`}
						</button>
					)}
					{detailsOpen && hasDetails && (
						<div className="mt-1.5 space-y-0">
							{warning.details!.map((d, i) => (
								<div key={i} className="text-[9px] font-mono text-muted-foreground/25 py-[1px] truncate">
									{d}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function StackWarnings({ warnings, defaultCollapsed }: {
	warnings: StackWarning[];
	defaultCollapsed?: boolean;
}) {
	if (warnings.length === 0) return null;

	const grouped = groupByCategory(warnings);
	const sortedCategories = CATEGORY_ORDER.filter((c) => grouped.has(c));
	const hasAnyWarn = warnings.some((w) => w.severity === "warn");

	return (
		<div className="space-y-0">
			{sortedCategories.map((category) => (
				<WarningGroup
					key={category}
					category={category}
					items={grouped.get(category)!}
					defaultOpen={!defaultCollapsed && hasAnyWarn}
				/>
			))}
		</div>
	);
}
