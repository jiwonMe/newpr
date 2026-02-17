export class AnalysisError extends Error {
	constructor(
		message: string,
		public readonly stage: string,
		public override readonly cause?: Error,
	) {
		super(message);
		this.name = "AnalysisError";
	}
}

export class PartialAnalysisError extends AnalysisError {
	constructor(
		message: string,
		stage: string,
		public readonly failedFiles: string[],
		cause?: Error,
	) {
		super(message, stage, cause);
		this.name = "PartialAnalysisError";
	}
}
