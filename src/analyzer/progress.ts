export type ProgressStage =
	| "fetching"
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
}

export type ProgressCallback = (event: ProgressEvent) => void;

export function createStderrProgress(): ProgressCallback {
	return (event: ProgressEvent) => {
		const prefix = `[newpr]`;
		if (event.current !== undefined && event.total !== undefined) {
			process.stderr.write(`${prefix} ${event.stage}: ${event.message} (${event.current}/${event.total})\n`);
		} else {
			process.stderr.write(`${prefix} ${event.stage}: ${event.message}\n`);
		}
	};
}

export function createSilentProgress(): ProgressCallback {
	return () => {};
}
