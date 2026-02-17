export type ProgressStage =
	| "fetching"
	| "cloning"
	| "checkout"
	| "exploring"
	| "parsing"
	| "analyzing"
	| "grouping"
	| "summarizing"
	| "narrating"
	| "done";

export interface ProgressEvent {
	stage: ProgressStage;
	message: string;
	current?: number;
	total?: number;
	partial_content?: string;
	timestamp?: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

const STAGE_ORDER: ProgressStage[] = [
	"fetching", "cloning", "checkout", "exploring",
	"parsing", "analyzing", "grouping", "summarizing", "narrating", "done",
];

export function stageIndex(stage: ProgressStage): number {
	return STAGE_ORDER.indexOf(stage);
}

export function allStages(): ProgressStage[] {
	return [...STAGE_ORDER];
}

export function createStderrProgress(): ProgressCallback {
	return (event: ProgressEvent) => {
		const prefix = "[newpr]";
		const progress =
			event.current !== undefined && event.total !== undefined
				? ` (${event.current}/${event.total})`
				: "";
		process.stderr.write(`${prefix} ${event.stage}: ${event.message}${progress}\n`);
	};
}

export function createSilentProgress(): ProgressCallback {
	return () => {};
}

export function createStreamJsonProgress(): ProgressCallback {
	const startTime = Date.now();
	return (event: ProgressEvent) => {
		const line = JSON.stringify({
			type: "progress",
			timestamp: new Date().toISOString(),
			elapsed_ms: Date.now() - startTime,
			stage: event.stage,
			stage_index: stageIndex(event.stage),
			total_stages: STAGE_ORDER.length,
			message: event.message,
		current: event.current ?? null,
		total: event.total ?? null,
		partial_content: event.partial_content ?? null,
		});
		process.stdout.write(`${line}\n`);
	};
}
