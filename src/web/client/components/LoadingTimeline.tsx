import { useState, useEffect, useRef } from "react";
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

const MAX_LOG_LINES = 8;

interface StepInfo {
	stage: ProgressStage;
	message: string;
	done: boolean;
	active: boolean;
	durationMs?: number;
	current?: number;
	total?: number;
	log: string[];
}

function buildSteps(events: ProgressEvent[]): StepInfo[] {
	const stages = allStages();
	const lastByStage = new Map<ProgressStage, ProgressEvent>();
	const firstTs = new Map<ProgressStage, number>();
	const logByStage = new Map<ProgressStage, string[]>();
	let maxIdx = -1;

	for (const e of events) {
		lastByStage.set(e.stage, e);
		if (e.timestamp && !firstTs.has(e.stage)) firstTs.set(e.stage, e.timestamp);
		const idx = stageIndex(e.stage);
		if (idx > maxIdx) maxIdx = idx;

		if (e.message && !e.partial_content) {
			const existing = logByStage.get(e.stage) ?? [];
			const last = existing[existing.length - 1];
			if (e.message !== last) {
				existing.push(e.message);
				logByStage.set(e.stage, existing);
			}
		}
	}

	return stages
		.filter((_, i) => i <= maxIdx + 1 && i < stages.length - 1)
		.map((stage) => {
			const event = lastByStage.get(stage);
			const idx = stageIndex(stage);
			const done = idx < maxIdx;
			const active = idx === maxIdx;
			const log = logByStage.get(stage) ?? [];

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
				log,
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
	const logEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500);
		return () => clearInterval(timer);
	}, [startedAt]);

	useEffect(() => {
		logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, [events.length]);

	const steps = buildSteps(events);
	const seconds = Math.floor(elapsed / 1000);

	const prInfo = events.find((e) => e.pr_title);
	const title = prInfo?.pr_title;
	const prNum = prInfo?.pr_number;

	return (
		<div className="flex flex-col items-center py-16">
			<div className="w-full max-w-lg">
				<div className="mb-8">
					<div className="flex items-center gap-2">
						{title ? (
							<span className="text-sm font-semibold truncate">{title}</span>
						) : (
							<span className="text-sm font-semibold font-mono">newpr</span>
						)}
						<span className="text-muted-foreground/30">·</span>
						<span className="text-sm text-muted-foreground/50 tabular-nums shrink-0">
							{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
						</span>
					</div>
					{prNum && (
						<span className="text-xs text-muted-foreground/40 font-mono">#{prNum}</span>
					)}
				</div>

				<div className="space-y-3">
					{steps.map((step) => {
						const completionDetail = step.message !== STAGE_LABELS[step.stage] ? step.message : "";
						const progress = step.current !== undefined && step.total !== undefined
							? ` (${step.current}/${step.total})`
							: "";
						const recentLog = step.log.slice(-MAX_LOG_LINES);

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
								<span className={`text-base font-medium ${step.done ? "text-muted-foreground" : step.active ? "text-foreground" : "text-muted-foreground/50"}`}>
										{STAGE_LABELS[step.stage]}{progress}
									</span>
									{step.done && step.durationMs !== undefined && (
										<span className="text-sm text-muted-foreground/60">
											{formatDuration(step.durationMs)}
										</span>
									)}
								</div>
								{step.done && completionDetail && (
									<p className="text-sm text-muted-foreground/60 mt-0.5 truncate">{completionDetail}</p>
								)}
									{step.active && recentLog.length > 0 && (
										<div className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
											{recentLog.map((line, j) => {
												const isLast = j === recentLog.length - 1;
												return (
													<p
														key={`${step.stage}-${j}`}
														className={`text-xs font-mono truncate ${isLast ? "text-muted-foreground" : "text-muted-foreground/40"}`}
													>
														{line}
													</p>
												);
											})}
											<div ref={logEndRef} />
										</div>
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
