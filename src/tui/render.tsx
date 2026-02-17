import { useState, useEffect, useRef } from "react";
import { render } from "ink";
import type { NewprOutput } from "../types/output.ts";
import type { NewprConfig } from "../types/config.ts";
import type { ProgressEvent } from "../analyzer/progress.ts";
import { App } from "./App.tsx";
import { LoadingTimeline, buildStepLog } from "./Loading.tsx";
import { Shell } from "./Shell.tsx";

function LoadingApp({
	resolve,
}: { resolve: (handlers: LoadingHandlers) => void }) {
	const [data, setData] = useState<NewprOutput | null>(null);
	const eventsRef = useRef<ProgressEvent[]>([]);
	const [steps, setSteps] = useState(buildStepLog([]));
	const [elapsed, setElapsed] = useState(0);
	const startRef = useRef(Date.now());

	useEffect(() => {
		const timer = setInterval(() => {
			setElapsed(Date.now() - startRef.current);
		}, 500);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		resolve({
			update(event: ProgressEvent) {
				eventsRef.current = [...eventsRef.current, event];
				setSteps(buildStepLog(eventsRef.current));
			},
			finish(result: NewprOutput) {
				setData(result);
			},
		});
	}, [resolve]);

	if (data) {
		return <App data={data} />;
	}

	return <LoadingTimeline steps={steps} elapsed={elapsed} />;
}

export interface LoadingHandlers {
	update: (event: ProgressEvent) => void;
	finish: (data: NewprOutput) => void;
}

export function renderTui(data: NewprOutput): void {
	render(<App data={data} />);
}

export function renderLoading(): Promise<LoadingHandlers> {
	return new Promise<LoadingHandlers>((resolve) => {
		render(<LoadingApp resolve={resolve} />);
	});
}

export function renderShell(token: string, config: NewprConfig, initialPr?: string): void {
	render(<Shell token={token} config={config} initialPr={initialPr} />);
}
