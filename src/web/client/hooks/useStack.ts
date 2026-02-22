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
	publishedAt?: number;
	cleanupResult?: {
		mode: "close" | "delete";
		completedAt: number;
		items: Array<{
			group_id: string;
			number: number;
			head_branch: string;
			closed: boolean;
			branch_deleted: boolean;
			message?: string;
		}>;
	};
}

interface PublishPreviewData {
	template_path: string | null;
	generatedAt?: number;
	items: Array<{
		group_id: string;
		title: string;
		base_branch: string;
		head_branch: string;
		order: number;
		total: number;
		body: string;
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
	publishResult: PublishResultData | null;
	publishPreview: PublishPreviewData | null;
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
	publishPreview: PublishPreviewData | null;
	publishPreviewLoading: boolean;
	publishPreviewError: string | null;
	publishCleanupLoading: boolean;
	publishCleanupError: string | null;
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
		publishResult: server.publishResult,
		publishPreview: server.publishPreview,
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
		publishPreview: null,
		publishPreviewLoading: false,
		publishPreviewError: null,
		publishCleanupLoading: false,
		publishCleanupError: null,
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
		setState((s) => ({
			...s,
			phase: "publishing",
			error: null,
			progressMessage: "Publishing draft PRs... this can take around a minute.",
		}));
		try {
			const res = await fetch("/api/stack/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId }),
			});
			const raw = await res.text();
			let data: Record<string, unknown> = {};
			try {
				data = raw ? JSON.parse(raw) as Record<string, unknown> : {};
			} catch {
				if (!res.ok) throw new Error(raw || "Publishing failed");
				throw new Error("Invalid server response while publishing stack");
			}
			if (!res.ok) {
				const message = typeof data.error === "string" ? data.error : "Publishing failed";
				throw new Error(message);
			}

			const publishResult = data.publish_result as PublishResultData;
			const serverState = (data as { state?: ServerStackState }).state;
			const nextPublishResult = serverState?.publishResult ?? publishResult;

			setState((s) => ({
				...s,
				...(serverState ? applyServerState(serverState) : {}),
				phase: "done",
				publishResult: nextPublishResult,
				progressMessage: null,
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
				progressMessage: null,
			}));
		}
	}, [sessionId, options]);

	const loadPublishPreview = useCallback(async (force = false) => {
		if (!sessionId) return;

		setState((s) => {
			if (!force && s.publishPreviewLoading) return s;
			return { ...s, publishPreviewLoading: true, publishPreviewError: null };
		});

		try {
			const res = await fetch("/api/stack/publish/preview", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId }),
			});
			const raw = await res.text();
			let data: { preview?: PublishPreviewData; state?: ServerStackState; error?: string } = {};
			try {
				data = raw ? JSON.parse(raw) as { preview?: PublishPreviewData; state?: ServerStackState; error?: string } : {};
			} catch {
				if (!res.ok) throw new Error(raw || "Failed to load publish preview");
				throw new Error("Invalid server response while loading publish preview");
			}
			if (!res.ok || !data.preview) throw new Error(data.error ?? "Failed to load publish preview");
			const serverState = data.state;

			setState((s) => ({
				...s,
				...(serverState ? applyServerState(serverState) : {}),
				publishPreview: serverState?.publishPreview ?? data.preview!,
				publishPreviewLoading: false,
				publishPreviewError: null,
			}));
		} catch (err) {
			setState((s) => ({
				...s,
				publishPreviewLoading: false,
				publishPreviewError: err instanceof Error ? err.message : String(err),
			}));
		}
	}, [sessionId]);

	const cleanupPublished = useCallback(async (mode: "close" | "delete") => {
		if (!sessionId) return;

		setState((s) => ({
			...s,
			publishCleanupLoading: true,
			publishCleanupError: null,
			progressMessage: mode === "delete"
				? "Closing draft PRs and deleting stack branches..."
				: "Closing draft PRs...",
		}));

		try {
			const res = await fetch("/api/stack/publish/cleanup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, mode }),
			});

			const raw = await res.text();
			let data: { cleanup_result?: PublishResultData["cleanupResult"]; state?: ServerStackState; error?: string } = {};
			try {
				data = raw ? JSON.parse(raw) as { cleanup_result?: PublishResultData["cleanupResult"]; state?: ServerStackState; error?: string } : {};
			} catch {
				if (!res.ok) throw new Error(raw || "Failed to cleanup stack PRs");
				throw new Error("Invalid server response while cleaning up stack PRs");
			}

			if (!res.ok) throw new Error(data.error ?? "Failed to cleanup stack PRs");

			const serverState = data.state;
			setState((s) => {
				const fallbackPublishResult = s.publishResult
					? {
						...s.publishResult,
						cleanupResult: data.cleanup_result ?? s.publishResult.cleanupResult,
					}
					: s.publishResult;

				return {
					...s,
					...(serverState ? applyServerState(serverState) : {}),
					publishResult: serverState?.publishResult ?? fallbackPublishResult,
					publishCleanupLoading: false,
					publishCleanupError: null,
					progressMessage: null,
				};
			});
		} catch (err) {
			setState((s) => ({
				...s,
				publishCleanupLoading: false,
				publishCleanupError: err instanceof Error ? err.message : String(err),
				progressMessage: null,
			}));
		}
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) return;
		if (state.phase !== "done") return;
		if (!state.execResult) return;
		if (state.publishResult) return;
		if (state.publishPreview || state.publishPreviewLoading || state.publishPreviewError) return;
		loadPublishPreview();
	}, [sessionId, state.phase, state.execResult, state.publishResult, state.publishPreview, state.publishPreviewLoading, state.publishPreviewError, loadPublishPreview]);

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
			publishPreview: null,
			publishPreviewLoading: false,
			publishPreviewError: null,
			publishCleanupLoading: false,
			publishCleanupError: null,
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
		loadPublishPreview,
		cleanupPublished,
		reset,
	};
}
