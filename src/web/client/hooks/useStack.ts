import { useState, useCallback } from "react";
import type { FeasibilityResult, StackWarning } from "../../../stack/types.ts";

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
	deltas_count?: number;
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
}

export function useStack(sessionId: string | null | undefined) {
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
	});

	const setMaxGroups = useCallback((n: number | null) => {
		setState((s) => ({ ...s, maxGroups: n }));
	}, []);

	const startPartition = useCallback(async () => {
		if (!sessionId) return;
		setState((s) => ({ ...s, phase: "partitioning", error: null }));
		try {
			const res = await fetch("/api/stack/partition", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, maxGroups: state.maxGroups }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Partition failed");

			setState((s) => ({
				...s,
				phase: data.feasibility.feasible ? "partitioning" : "error",
				partition: data.partition,
				feasibility: data.feasibility,
				context: data.context,
				error: data.feasibility.feasible ? null : "Stacking is not feasible — dependency cycle detected",
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, state.maxGroups]);

	const startPlan = useCallback(async () => {
		if (!sessionId || !state.partition || !state.feasibility || !state.context) return;
		setState((s) => ({ ...s, phase: "planning" }));
		try {
			const res = await fetch("/api/stack/plan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					ownership: state.partition.ownership,
					feasibility: state.feasibility,
					groups: state.partition.groups,
					context: state.context,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Planning failed");

			setState((s) => ({
				...s,
				plan: data.plan,
				context: data.context,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, state.partition, state.feasibility, state.context]);

	const startExecute = useCallback(async () => {
		if (!sessionId || !state.plan || !state.partition || !state.context) return;
		setState((s) => ({ ...s, phase: "executing" }));
		try {
			const res = await fetch("/api/stack/execute", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					plan: state.plan,
					ownership: state.partition.ownership,
					context: state.context,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Execution failed");

			setState((s) => ({
				...s,
				execResult: data.exec_result,
				verifyResult: data.verify_result,
				context: data.context,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, state.plan, state.partition, state.context]);

	const startPublish = useCallback(async () => {
		if (!sessionId || !state.execResult || !state.context) return;
		setState((s) => ({ ...s, phase: "publishing" }));
		try {
			const res = await fetch("/api/stack/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					exec_result: state.execResult,
					context: state.context,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "Publishing failed");

			setState((s) => ({
				...s,
				phase: "done",
				publishResult: data.publish_result,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, state.execResult, state.context]);

	const runFullPipeline = useCallback(async () => {
		if (!sessionId) return;

		setState((s) => ({ ...s, phase: "partitioning", error: null }));
		try {
			const partRes = await fetch("/api/stack/partition", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, maxGroups: state.maxGroups }),
			});
			const partData = await partRes.json();
			if (!partRes.ok) throw new Error(partData.error ?? "Partition failed");
			if (!partData.feasibility.feasible) {
				setState((s) => ({
					...s,
					phase: "error",
					partition: partData.partition,
					feasibility: partData.feasibility,
					context: partData.context,
					error: "Stacking is not feasible — dependency cycle detected",
				}));
				return;
			}

			setState((s) => ({
				...s,
				phase: "planning",
				partition: partData.partition,
				feasibility: partData.feasibility,
				context: partData.context,
			}));

			const planRes = await fetch("/api/stack/plan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					ownership: partData.partition.ownership,
					feasibility: partData.feasibility,
					groups: partData.partition.groups,
					context: partData.context,
				}),
			});
			const planData = await planRes.json();
			if (!planRes.ok) throw new Error(planData.error ?? "Planning failed");

			setState((s) => ({
				...s,
				phase: "executing",
				plan: planData.plan,
				context: planData.context,
			}));

			const execRes = await fetch("/api/stack/execute", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					plan: planData.plan,
					ownership: partData.partition.ownership,
					context: planData.context,
				}),
			});
			const execData = await execRes.json();
			if (!execRes.ok) throw new Error(execData.error ?? "Execution failed");

			setState((s) => ({
				...s,
				execResult: execData.exec_result,
				verifyResult: execData.verify_result,
				context: execData.context,
			}));

			if (!execData.verify_result.verified) {
				setState((s) => ({
					...s,
					phase: "error",
					error: `Verification failed: ${execData.verify_result.errors.join(", ")}`,
				}));
				return;
			}

			setState((s) => ({ ...s, phase: "done" }));
		} catch (err) {
			setState((s) => ({
				...s,
				phase: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId, state.maxGroups]);

	const reset = useCallback(() => {
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
		}));
	}, []);

	return {
		...state,
		setMaxGroups,
		startPartition,
		startPlan,
		startExecute,
		startPublish,
		runFullPipeline,
		reset,
	};
}
