import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { stageIndex, allStages, type ProgressStage, type ProgressEvent } from "../analyzer/progress.ts";
import { T } from "./theme.ts";

const STAGE_LABELS: Record<ProgressStage, string> = {
	fetching: "Fetch PR data",
	cloning: "Clone repository",
	checkout: "Checkout branches",
	exploring: "Explore codebase",
	parsing: "Parse diff",
	analyzing: "Analyze files",
	grouping: "Group changes",
	summarizing: "Generate summary",
	narrating: "Write narrative",
	done: "Complete",
};

const STREAM_PREVIEW_LINES = 4;
const STREAM_LINE_MAX_CHARS = 80;

export interface StepLog {
	stage: ProgressStage;
	message: string;
	current?: number;
	total?: number;
	done: boolean;
	partial_content?: string;
	durationMs?: number;
}

function getPreviewLines(content: string): string {
	const raw = content
		.replace(/^[\s\n]*\{?\s*/, "")
		.replace(/["{}[\]]/g, "")
		.replace(/\\n/g, "\n")
		.replace(/^\s*\w+\s*:\s*/gm, "");

	const lines = raw
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	return lines
		.slice(-STREAM_PREVIEW_LINES)
		.map((l) => (l.length > STREAM_LINE_MAX_CHARS ? l.slice(0, STREAM_LINE_MAX_CHARS) + "…" : l))
		.join("\n");
}

export function buildStepLog(events: ProgressEvent[]): StepLog[] {
	const stages = allStages();
	const lastEventByStage = new Map<ProgressStage, ProgressEvent>();
	const firstTimestamp = new Map<ProgressStage, number>();
	let maxStageIdx = -1;

	for (const e of events) {
		lastEventByStage.set(e.stage, e);
		if (e.timestamp && !firstTimestamp.has(e.stage)) {
			firstTimestamp.set(e.stage, e.timestamp);
		}
		const idx = stageIndex(e.stage);
		if (idx > maxStageIdx) maxStageIdx = idx;
	}

	return stages
		.filter((_, i) => i <= maxStageIdx + 1 && i < stages.length - 1)
		.map((stage) => {
			const event = lastEventByStage.get(stage);
			const idx = stageIndex(stage);
			const done = idx < maxStageIdx;

			let durationMs: number | undefined;
			if (done) {
				const start = firstTimestamp.get(stage);
				const nextStages = stages.filter((_, i) => i > idx);
				const nextStart = nextStages.reduce<number | undefined>(
					(found, s) => found ?? firstTimestamp.get(s),
					undefined,
				);
				if (start && nextStart) durationMs = nextStart - start;
			}

			return {
				stage,
				message: event?.message ?? STAGE_LABELS[stage],
				current: event?.current,
				total: event?.total,
				done,
				partial_content: event?.partial_content,
				durationMs,
			};
		});
}

export function LoadingTimeline({ steps, elapsed }: { steps: StepLog[]; elapsed: number }) {
	return (
		<Box flexDirection="column" paddingX={2} paddingY={1}>
			<Box gap={1} marginBottom={1}>
				<Text bold color={T.primary}>newpr</Text>
				<Text color={T.faint}>│</Text>
				<Text color={T.muted}>{formatElapsed(elapsed)}</Text>
			</Box>

			{steps.map((step, i) => {
				const isLast = i === steps.length - 1;
				const isActive = isLast && !step.done;
				const progress =
					step.current !== undefined && step.total !== undefined
						? ` (${step.current}/${step.total})`
						: "";
				const preview = isActive && step.partial_content
					? getPreviewLines(step.partial_content)
					: null;
				const duration = step.done && step.durationMs !== undefined
					? formatDuration(step.durationMs)
					: null;
				const detail = step.message !== STAGE_LABELS[step.stage]
					? step.message
					: "";

				return (
					<Box key={step.stage} flexDirection="column">
						<Box gap={1}>
							{step.done ? (
								<Text color={T.ok}>✓</Text>
							) : isActive ? (
								<Text color={T.primary}><Spinner type="dots" /></Text>
							) : (
								<Text color={T.faint}>○</Text>
							)}
							<Text color={step.done ? T.muted : isActive ? T.primary : T.faint} bold={isActive}>
								{STAGE_LABELS[step.stage]}
							</Text>
							{step.done && (
								<Text color={T.faint}>
									{detail ? `${detail} ` : ""}{duration && `(${duration})`}
								</Text>
							)}
							{isActive && (
								<Text color={T.muted}>
									{detail}
									{progress}
								</Text>
							)}
						</Box>
						{preview && (
							<Box marginLeft={3} marginBottom={0}>
								<Text color={T.faint} dimColor>
									{preview}
								</Text>
							</Box>
						)}
					</Box>
				);
			})}
		</Box>
	);
}

function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = (ms / 1000).toFixed(1);
	return `${s}s`;
}

export function Loading({
	message,
	current,
	total,
}: { message: string; current?: number; total?: number }) {
	const progress = current !== undefined && total !== undefined ? ` (${current}/${total})` : "";

	return (
		<Box flexDirection="column" paddingX={2} paddingY={1}>
			<Box gap={1}>
				<Text color={T.primary}>
					<Spinner type="dots" />
				</Text>
				<Text>
					{message}
					{progress}
				</Text>
			</Box>
		</Box>
	);
}
