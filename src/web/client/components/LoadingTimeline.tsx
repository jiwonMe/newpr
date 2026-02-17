import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { ProgressEvent, ProgressStage } from "../../../analyzer/progress.ts";
import { stageIndex, allStages } from "../../../analyzer/progress.ts";

const STAGE_LABELS: Record<ProgressStage, string> = {
	fetching: "Fetch PR data",
	parsing: "Parse diff",
	cloning: "Clone repository",
	checkout: "Checkout branches",
	exploring: "Explore codebase",
	analyzing: "Analyze files",
	grouping: "Group changes",
	summarizing: "Generate summary",
	narrating: "Write narrative",
	done: "Complete",
};

interface StepInfo {
	stage: ProgressStage;
	message: string;
	done: boolean;
	active: boolean;
	durationMs?: number;
	current?: number;
	total?: number;
}

function buildSteps(events: ProgressEvent[]): StepInfo[] {
	const stages = allStages();
	const lastByStage = new Map<ProgressStage, ProgressEvent>();
	const firstTs = new Map<ProgressStage, number>();
	let maxIdx = -1;

	for (const e of events) {
		lastByStage.set(e.stage, e);
		if (e.timestamp && !firstTs.has(e.stage)) firstTs.set(e.stage, e.timestamp);
		const idx = stageIndex(e.stage);
		if (idx > maxIdx) maxIdx = idx;
	}

	return stages
		.filter((_, i) => i <= maxIdx + 1 && i < stages.length - 1)
		.map((stage) => {
			const event = lastByStage.get(stage);
			const idx = stageIndex(stage);
			const done = idx < maxIdx;
			const active = idx === maxIdx;

			let durationMs: number | undefined;
			if (done) {
				const start = firstTs.get(stage);
				const nextStart = stages
					.filter((_, i) => i > idx)
					.reduce<number | undefined>((f, s) => f ?? firstTs.get(s), undefined);
				if (start && nextStart) durationMs = nextStart - start;
			}

			return {
				stage,
				message: event?.message ?? STAGE_LABELS[stage],
				done,
				active,
				durationMs,
				current: event?.current,
				total: event?.total,
			};
		});
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function LoadingTimeline({
	events,
	startedAt,
}: {
	events: ProgressEvent[];
	startedAt: number;
}) {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500);
		return () => clearInterval(timer);
	}, [startedAt]);

	const steps = buildSteps(events);
	const seconds = Math.floor(elapsed / 1000);

	return (
		<div className="flex flex-col items-center py-16">
			<div className="w-full max-w-lg">
				<div className="flex items-center gap-2 mb-8">
					<span className="text-lg font-bold">newpr</span>
					<span className="text-muted-foreground">·</span>
					<span className="text-sm text-muted-foreground">
						{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
					</span>
				</div>

				<div className="space-y-3">
					{steps.map((step) => {
						const detail = step.message !== STAGE_LABELS[step.stage] ? step.message : "";
						const progress = step.current !== undefined && step.total !== undefined
							? ` (${step.current}/${step.total})`
							: "";

						return (
							<div key={step.stage} className="flex items-start gap-3">
								{step.done ? (
									<CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
								) : step.active ? (
									<Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5 shrink-0" />
								) : (
									<Circle className="h-5 w-5 text-muted-foreground/30 mt-0.5 shrink-0" />
								)}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className={`text-sm font-medium ${step.done ? "text-muted-foreground" : step.active ? "text-foreground" : "text-muted-foreground/50"}`}>
											{STAGE_LABELS[step.stage]}
										</span>
										{step.done && step.durationMs !== undefined && (
											<span className="text-xs text-muted-foreground/60">
												{formatDuration(step.durationMs)}
											</span>
										)}
									</div>
									{(step.done && detail) && (
										<p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{detail}</p>
									)}
									{step.active && (detail || progress) && (
										<p className="text-xs text-muted-foreground mt-0.5 truncate">
											{detail}{progress}
										</p>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
