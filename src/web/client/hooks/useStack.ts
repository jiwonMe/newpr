import { useState, useCallback, useEffect, useRef } from "react";
import type { FeasibilityResult, StackWarning, StackGroupStats } from "../../../stack/types.ts";

type StackPhase = "idle" | "partitioning" | "planning" | "executing" | "publishing" | "done" | "error";

interface GroupData {
	name: string;
	type: string;
	description: string;
	files: string[];
	key_changes?: string[];
}

interface PartitionData {
	ownership: Record<string, string>;
	reattributed: Array<{ path: string; from_groups: string[]; to_group: string; reason: string }>;
	warnings: string[];
	structured_warnings: StackWarning[];
	forced_merges: Array<{ path: string; from_group: string; to_group: string }>;
	groups?: GroupData[];
}

interface StackContext {
	repo_path: string;
	base_sha: string;
	head_sha: string;
	base_branch: string;
	head_branch: string;
	pr_number: number;
	owner: string;
	repo: string;
}

interface PlanData {
	base_sha: string;
	head_sha: string;
	groups: Array<{
		id: string;
		name: string;
		type: string;
		description: string;
		files: string[];
		deps: string[];
		order: number;
		stats?: StackGroupStats;
		pr_title?: string;
	}>;
	expected_trees: Record<string, string>;
}

interface ExecResultData {
	run_id: string;
	source_copy_branch: string;
	group_commits: Array<{
		group_id: string;
		commit_sha: string;
		tree_sha: string;
		branch_name: string;
		pr_title?: string;
	}>;
	final_tree_sha: string;
	verified: boolean;
}

interface VerifyResultData {
	verified: boolean;
	errors: string[];
	warnings: string[];
	structured_warnings: StackWarning[];
}

interface PublishResultData {
	branches: Array<{ name: string; pushed: boolean }>;
	prs: Array<{
		group_id: string;
		number: number;
		url: string;
		title: string;
		base_branch: string;
		head_branch: string;
	}>;
}

interface ServerStackState {
	status: string;
	phase: string | null;
	error: string | null;
	maxGroups: number | null;
	context: StackContext | null;
	partition: PartitionData | null;
	feasibility: FeasibilityResult | null;
	plan: PlanData | null;
	execResult: ExecResultData | null;
	verifyResult: VerifyResultData | null;
	startedAt: number;
	finishedAt: number | null;
}

export interface StackState {
	phase: StackPhase;
	error: string | null;
	maxGroups: number | null;
	partition: PartitionData | null;
	feasibility: FeasibilityResult | null;
	context: StackContext | null;
	plan: PlanData | null;
	execResult: ExecResultData | null;
	verifyResult: VerifyResultData | null;
	publishResult: PublishResultData | null;
	progressMessage: string | null;
}

function serverPhaseToClient(status: string, phase: string | null): StackPhase {
	if (status === "error" || status === "canceled") return "error";
	if (status === "done") return "done";
	if (phase === "partitioning") return "partitioning";
	if (phase === "planning") return "planning";
	if (phase === "executing") return "executing";
	if (phase === "done") return "done";
	return "idle";
}

function applyServerState(server: ServerStackState): Partial<StackState> {
	return {
		phase: serverPhaseToClient(server.status, server.phase),
		error: server.error,
		context: server.context,
		partition: server.partition,
		feasibility: server.feasibility,
		plan: server.plan,
		execResult: server.execResult,
		verifyResult: server.verifyResult,
	};
}

interface UseStackOptions {
	onTrackAnalysis?: (analysisSessionId: string, prUrl: string) => void;
}

export function useStack(sessionId: string | null | undefined, options?: UseStackOptions) {
	const [state, setState] = useState<StackState>({
		phase: "idle",
		error: null,
		maxGroups: null,
		partition: null,
		feasibility: null,
		context: null,
		plan: null,
		execResult: null,
		verifyResult: null,
		publishResult: null,
		progressMessage: null,
	});

	const eventSourceRef = useRef<EventSource | null>(null);

	useEffect(() => {
		if (!sessionId) return;

		fetch(`/api/stack/${sessionId}`)
			.then((res) => res.json())
			.then((data: { state: ServerStackState | null }) => {
				if (!data.state) return;
				setState((s) => ({ ...s, ...applyServerState(data.state!) }));
			})
			.catch(() => {});
	}, [sessionId]);

	const setMaxGroups = useCallback((n: number | null) => {
		setState((s) => ({ ...s, maxGroups: n }));
	}, []);

	const connectSSE = useCallback((id: string) => {
		eventSourceRef.current?.close();

		const es = new EventSource(`/api/stack/${id}/events`);
		eventSourceRef.current = es;

		es.addEventListener("progress", (e) => {
			try {
				const data = JSON.parse(e.data) as { phase: string; message: string; state: ServerStackState };
				setState((s) => ({
					...s,
					...applyServerState(data.state),
					progressMessage: data.message,
				}));
			} catch {}
		});

		es.addEventListener("done", (e) => {
			try {
				const data = JSON.parse(e.data) as { state: ServerStackState };
				setState((s) => ({
					...s,
					...applyServerState(data.state),
					progressMessage: null,
				}));
			} catch {}
			es.close();
			eventSourceRef.current = null;
		});

		es.addEventListener("stack_error", (e) => {
			try {
				const data = JSON.parse(e.data) as { message: string; state?: ServerStackState };
				setState((s) => ({
					...s,
					phase: "error",
					error: data.message,
					...(data.state ? applyServerState(data.state) : {}),
					progressMessage: null,
				}));
			} catch {}
			es.close();
			eventSourceRef.current = null;
		});

		es.onerror = () => {
			if (es.readyState === EventSource.CLOSED) {
				eventSourceRef.current = null;
			}
		};
	}, []);

	const runFullPipeline = useCallback(async () => {
		if (!sessionId) return;

		setState((s) => ({ ...s, phase: "partitioning", error: null, progressMessage: "Starting..." }));
		try {
			const res = await fetch("/api/stack/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, maxGroups: state.maxGroups }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Failed to start stack pipeline");

			connectSSE(sessionId);
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
				progressMessage: null,
			}));
		}
	}, [sessionId, state.maxGroups, connectSSE]);

	const startPublish = useCallback(async () => {
		if (!sessionId) return;
		setState((s) => ({ ...s, phase: "publishing" }));
		try {
			const res = await fetch("/api/stack/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Publishing failed");

			const publishResult = data.publish_result as PublishResultData;

			setState((s) => ({
				...s,
				phase: "done",
				publishResult,
			}));

			if (options?.onTrackAnalysis && publishResult?.prs?.length > 0) {
				for (const pr of publishResult.prs) {
					try {
						const analysisRes = await fetch("/api/analysis", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ pr: pr.url }),
						});
						const analysisData = await analysisRes.json() as { sessionId?: string };
						if (analysisData.sessionId) {
							options.onTrackAnalysis(analysisData.sessionId, pr.url);
						}
					} catch {}
				}
			}
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, options]);

	const reset = useCallback(() => {
		eventSourceRef.current?.close();
		eventSourceRef.current = null;
		setState((s) => ({
			phase: "idle",
			error: null,
			maxGroups: s.maxGroups,
			partition: null,
			feasibility: null,
			context: null,
			plan: null,
			execResult: null,
			verifyResult: null,
			publishResult: null,
			progressMessage: null,
		}));
	}, []);

	useEffect(() => {
		return () => {
			eventSourceRef.current?.close();
		};
	}, []);

	return {
		...state,
		setMaxGroups,
		runFullPipeline,
		startPublish,
		reset,
	};
}
