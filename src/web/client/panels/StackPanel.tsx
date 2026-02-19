import { Loader2, Play, Upload, RotateCcw, CheckCircle2, AlertTriangle, Circle, GitPullRequestArrow, ArrowRight, Layers } from "lucide-react";
import { useStack } from "../hooks/useStack.ts";
import { FeasibilityAlert } from "../components/FeasibilityAlert.tsx";
import { StackGroupCard } from "../components/StackGroupCard.tsx";
import { StackWarnings } from "../components/StackWarnings.tsx";

type StackPhase = "idle" | "partitioning" | "planning" | "executing" | "publishing" | "done" | "error";

const PIPELINE_STEPS = [
	{ phase: "partitioning" as const, label: "Partition", description: "Assigning files to groups" },
	{ phase: "planning" as const, label: "Plan", description: "Building stack plan" },
	{ phase: "executing" as const, label: "Execute", description: "Creating commits" },
] as const;

function getStepState(stepPhase: string, currentPhase: StackPhase, isDone: boolean) {
	const order = ["partitioning", "planning", "executing"];
	const stepIdx = order.indexOf(stepPhase);
	const currentIdx = order.indexOf(currentPhase);

	if (isDone || (currentIdx > stepIdx)) return "done";
	if (currentPhase === stepPhase) return "active";
	return "pending";
}

function PipelineTimeline({ phase }: { phase: StackPhase }) {
	const isDone = phase === "done" || phase === "publishing";

	return (
		<div className="relative flex flex-col gap-0 py-1">
			{PIPELINE_STEPS.map((step, i) => {
				const state = getStepState(step.phase, phase, isDone);
				const isLast = i === PIPELINE_STEPS.length - 1;

				return (
					<div key={step.phase} className="relative flex items-start gap-3">
						{!isLast && (
							<div className={`absolute left-[9px] top-[20px] w-px h-[calc(100%-8px)] ${
								state === "done" ? "bg-foreground/20" : "bg-border"
							}`} />
						)}

						<div className="relative z-10 mt-0.5 shrink-0">
							{state === "done" ? (
								<CheckCircle2 className="h-[18px] w-[18px] text-foreground/70" />
							) : state === "active" ? (
								<Loader2 className="h-[18px] w-[18px] text-foreground animate-spin" />
							) : (
								<Circle className="h-[18px] w-[18px] text-muted-foreground/20" />
							)}
						</div>

						<div className={`pb-4 min-w-0 ${isLast ? "pb-0" : ""}`}>
							<span className={`text-[12px] font-medium ${
								state === "done" ? "text-muted-foreground"
									: state === "active" ? "text-foreground"
										: "text-muted-foreground/40"
							}`}>
								{step.label}
							</span>
							{state === "active" && (
								<p className="text-[11px] text-muted-foreground/50 mt-0.5">{step.description}</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

interface StackPanelProps {
	sessionId?: string | null;
	onTrackAnalysis?: (analysisSessionId: string, prUrl: string) => void;
}

export function StackPanel({ sessionId, onTrackAnalysis }: StackPanelProps) {
	const stack = useStack(sessionId, { onTrackAnalysis });

	if (stack.phase === "idle") {
		return (
			<div className="pt-6 px-1">
				<div className="flex items-center gap-2.5 mb-5">
					<div className="h-8 w-8 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
						<Layers className="h-4 w-4 text-foreground/50" />
					</div>
					<div>
						<h3 className="text-[13px] font-semibold text-foreground">PR Stacking</h3>
						<p className="text-[11px] text-muted-foreground/50">Split into focused, reviewable PRs</p>
					</div>
				</div>

				<p className="text-[11px] text-muted-foreground/40 leading-[1.6] mb-5">
					Automatically split this PR into a stack of smaller draft PRs based on the analysis groups. Each group becomes its own PR with proper dependency ordering.
				</p>

				<div className="flex items-center gap-3 mb-5">
					<span className="text-[11px] text-muted-foreground/50">Max PRs</span>
					<div className="flex items-center">
						<button
							type="button"
							onClick={() => stack.setMaxGroups(Math.max(1, (stack.maxGroups ?? 2) - 1))}
							className="h-7 w-7 rounded-l-md border border-r-0 bg-transparent text-[11px] text-muted-foreground/50 hover:bg-accent/30 transition-colors flex items-center justify-center"
						>
							−
						</button>
						<input
							type="number"
							min={1}
							placeholder="auto"
							value={stack.maxGroups ?? ""}
							onChange={(e) => stack.setMaxGroups(e.target.value ? Number(e.target.value) : null)}
							className="h-7 w-12 border-y bg-transparent text-[11px] text-center tabular-nums placeholder:text-muted-foreground/25 focus:outline-none"
						/>
						<button
							type="button"
							onClick={() => stack.setMaxGroups((stack.maxGroups ?? 2) + 1)}
							className="h-7 w-7 rounded-r-md border border-l-0 bg-transparent text-[11px] text-muted-foreground/50 hover:bg-accent/30 transition-colors flex items-center justify-center"
						>
							+
						</button>
					</div>
				</div>

				<button
					type="button"
					onClick={stack.runFullPipeline}
					className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-[12px] font-medium hover:bg-foreground/90 transition-colors"
				>
					<Play className="h-3.5 w-3.5" />
					Start Stacking
				</button>
			</div>
		);
	}

	const isRunning = ["partitioning", "planning", "executing", "publishing"].includes(stack.phase);

	return (
		<div className="pt-6 px-1 space-y-5">
			<div className="flex items-center gap-2">
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<Layers className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
					<span className="text-[12px] font-semibold text-foreground">PR Stacking</span>
					{stack.phase === "done" && !stack.publishResult && (
						<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-muted-foreground/60">Ready</span>
					)}
					{stack.publishResult && (
						<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">Published</span>
					)}
				</div>
				{stack.phase === "done" && (
					<button
						type="button"
						onClick={stack.reset}
						className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground transition-colors"
					>
						<RotateCcw className="h-3 w-3" />
					</button>
				)}
			</div>

			{isRunning && (
				<>
					<PipelineTimeline phase={stack.phase} />
					{stack.progressMessage && (
						<p className="text-[10px] text-muted-foreground/30 px-1 -mt-2">{stack.progressMessage}</p>
					)}
				</>
			)}

			{stack.phase === "error" && (
				<div className="rounded-lg bg-red-500/[0.04] px-3.5 py-3 space-y-3">
					<div className="flex items-start gap-2.5">
						<AlertTriangle className="h-3.5 w-3.5 text-red-500/70 shrink-0 mt-px" />
						<span className="text-[11px] text-red-600/80 dark:text-red-400/80 break-all leading-relaxed">
							{stack.error}
						</span>
					</div>
					<button
						type="button"
						onClick={stack.reset}
						className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
					>
						<RotateCcw className="h-3 w-3" />
						Try again
					</button>
				</div>
			)}

			{stack.feasibility && (
				<FeasibilityAlert result={stack.feasibility} />
			)}

			{stack.partition && stack.partition.structured_warnings.length > 0 && (
				<StackWarnings warnings={stack.partition.structured_warnings} />
			)}

			{stack.plan && (
				<div className="space-y-1">
					<div className="flex items-center justify-between mb-2">
						<span className="text-[11px] font-medium text-muted-foreground/40">
							{stack.plan.groups.length} PRs
						</span>
						{stack.plan.groups.length > 0 && (
							<span className="text-[10px] text-muted-foreground/25 tabular-nums">
								{stack.plan.groups.reduce((sum, g) => sum + g.files.length, 0)} files total
							</span>
						)}
					</div>
					<div className="space-y-0">
						{stack.plan.groups.map((group) => {
							const commit = stack.execResult?.group_commits.find((gc) => gc.group_id === group.id);
							const pr = stack.publishResult?.prs.find((p) => p.group_id === group.id);
							return (
								<StackGroupCard
									key={group.id}
									group={group}
									commit={commit}
									pr={pr}
								/>
							);
						})}
					</div>
				</div>
			)}

			{stack.verifyResult && (
				<div className="space-y-2">
					<div className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 ${
						stack.verifyResult.verified
							? "bg-green-500/[0.04]"
							: "bg-red-500/[0.04]"
					}`}>
						{stack.verifyResult.verified
							? <CheckCircle2 className="h-3.5 w-3.5 text-green-600/70 dark:text-green-400/70 shrink-0" />
							: <AlertTriangle className="h-3.5 w-3.5 text-red-500/70 shrink-0" />
						}
						<span className={`text-[11px] ${
							stack.verifyResult.verified
								? "text-green-700/70 dark:text-green-300/70"
								: "text-red-600/80 dark:text-red-400/80"
						}`}>
							{stack.verifyResult.verified
								? "Tree equivalence verified"
								: `Verification failed: ${stack.verifyResult.errors.join(", ")}`
							}
						</span>
					</div>
					{stack.verifyResult.structured_warnings.length > 0 && (
						<StackWarnings warnings={stack.verifyResult.structured_warnings} defaultCollapsed={stack.verifyResult.verified} />
					)}
				</div>
			)}

			{stack.phase === "done" && stack.execResult && !stack.publishResult && (
				<button
					type="button"
					onClick={stack.startPublish}
					className="w-full flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-[12px] font-medium hover:bg-foreground/90 transition-colors"
				>
					<Upload className="h-3.5 w-3.5" />
					Publish as Draft PRs
				</button>
			)}

			{stack.publishResult && stack.publishResult.prs.length > 0 && (
				<div className="space-y-1.5">
					{stack.publishResult.prs.map((pr) => (
						<a
							key={pr.number}
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center gap-3 rounded-lg px-3.5 py-2.5 hover:bg-accent/30 transition-colors"
						>
							<GitPullRequestArrow className="h-3.5 w-3.5 text-green-600/60 dark:text-green-400/60 shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-[11px] font-medium truncate">{pr.title}</span>
									<span className="text-[10px] text-muted-foreground/25 tabular-nums shrink-0">#{pr.number}</span>
								</div>
								<div className="flex items-center gap-1 mt-0.5">
									<span className="text-[10px] font-mono text-muted-foreground/25">{pr.base_branch}</span>
									<ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20" />
									<span className="text-[10px] font-mono text-muted-foreground/25">{pr.head_branch}</span>
								</div>
							</div>
						</a>
					))}
				</div>
			)}
		</div>
	);
}
