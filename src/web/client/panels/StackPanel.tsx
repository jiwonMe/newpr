import { Loader2, Play, Upload, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useStack } from "../hooks/useStack.ts";
import { FeasibilityAlert } from "../components/FeasibilityAlert.tsx";
import { StackGroupCard } from "../components/StackGroupCard.tsx";

export function StackPanel({ sessionId }: { sessionId?: string | null }) {
	const stack = useStack(sessionId);

	if (stack.phase === "idle") {
		return (
			<div className="pt-5 space-y-4">
				<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
					PR Stacking
				</div>
				<p className="text-[11px] text-muted-foreground/60 leading-relaxed">
					Split this PR into a stack of smaller, focused PRs based on the analysis groups.
					Each group becomes its own draft PR with proper dependencies.
				</p>
				<button
					type="button"
					onClick={stack.runFullPipeline}
					className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[11px] font-medium hover:bg-accent/40 transition-colors"
				>
					<Play className="h-3.5 w-3.5" />
					Start Stacking
				</button>
			</div>
		);
	}

	const isRunning = ["partitioning", "planning", "executing", "publishing"].includes(stack.phase);
	const phaseLabels: Record<string, string> = {
		partitioning: "Partitioning files...",
		planning: "Building stack plan...",
		executing: "Creating commits...",
		publishing: "Publishing PRs...",
	};

	return (
		<div className="pt-5 space-y-4">
			<div className="flex items-center gap-2">
				<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider flex-1">
					PR Stacking
				</div>
				{stack.phase === "done" && (
					<button
						type="button"
						onClick={stack.reset}
						className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors"
					>
						<RotateCcw className="h-3 w-3" />
						Reset
					</button>
				)}
			</div>

			{isRunning && (
				<div className="flex items-center gap-2.5 rounded-lg border bg-blue-500/5 px-3.5 py-2.5">
					<Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
					<span className="text-[11px] text-blue-600 dark:text-blue-400">
						{phaseLabels[stack.phase] ?? "Working..."}
					</span>
				</div>
			)}

			{stack.phase === "error" && (
				<div className="space-y-3">
					<div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
						<AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
						<span className="text-[11px] text-red-600 dark:text-red-400 break-all">
							{stack.error}
						</span>
					</div>
					<button
						type="button"
						onClick={stack.reset}
						className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
					>
						<RotateCcw className="h-3 w-3" />
						Try again
					</button>
				</div>
			)}

			{stack.feasibility && (
				<FeasibilityAlert result={stack.feasibility} />
			)}

			{stack.partition && stack.partition.warnings.length > 0 && (
				<div className="space-y-1">
					{stack.partition.warnings.map((w, i) => (
						<div key={i} className="flex items-center gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-400">
							<AlertTriangle className="h-2.5 w-2.5 shrink-0" />
							<span>{w}</span>
						</div>
					))}
				</div>
			)}

			{stack.partition && stack.partition.reattributed.length > 0 && (
				<div className="space-y-1">
					<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
						Re-attributed files
					</div>
					{stack.partition.reattributed.map((r) => (
						<div key={r.path} className="flex items-baseline gap-1.5 text-[10px] text-muted-foreground/50">
							<span className="font-mono">{r.path}</span>
							<span className="text-muted-foreground/25">→</span>
							<span className="font-medium">{r.to_group}</span>
							<span className="text-muted-foreground/30">({r.reason})</span>
						</div>
					))}
				</div>
			)}

			{stack.plan && (
				<div className="space-y-2">
					<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
						Stack ({stack.plan.groups.length} PRs)
					</div>
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
			)}

			{stack.verifyResult && (
				<div className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 ${
					stack.verifyResult.verified
						? "border-green-500/20 bg-green-500/5"
						: "border-red-500/20 bg-red-500/5"
				}`}>
					{stack.verifyResult.verified
						? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
						: <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
					}
					<span className={`text-[11px] ${
						stack.verifyResult.verified
							? "text-green-700 dark:text-green-300"
							: "text-red-600 dark:text-red-400"
					}`}>
						{stack.verifyResult.verified
							? "Tree equivalence verified — stack is correct"
							: `Verification failed: ${stack.verifyResult.errors.join(", ")}`
						}
					</span>
				</div>
			)}

			{stack.phase === "done" && stack.execResult && !stack.publishResult && (
				<button
					type="button"
					onClick={stack.startPublish}
					className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-colors"
				>
					<Upload className="h-3.5 w-3.5" />
					Publish Stack as Draft PRs
				</button>
			)}

			{stack.publishResult && (
				<div className="space-y-2">
					<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
						Published PRs
					</div>
					{stack.publishResult.prs.map((pr) => (
						<a
							key={pr.number}
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 rounded-lg border px-3.5 py-2 hover:bg-accent/30 transition-colors"
						>
							<CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
							<span className="text-[11px] font-medium flex-1 min-w-0 truncate">
								#{pr.number} {pr.title}
							</span>
							<span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">
								{pr.head_branch} → {pr.base_branch}
							</span>
						</a>
					))}
				</div>
			)}
		</div>
	);
}
