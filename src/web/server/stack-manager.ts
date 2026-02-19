import type { NewprConfig } from "../../types/config.ts";
import type { FileGroup } from "../../types/output.ts";
import type { StackWarning, FeasibilityResult, StackExecResult } from "../../stack/types.ts";
import type { StackPlan } from "../../stack/types.ts";
import { loadSession } from "../../history/store.ts";
import { saveStackSidecar, loadStackSidecar } from "../../history/store.ts";
import { parsePrInput } from "../../github/parse-pr.ts";
import { fetchPrData } from "../../github/fetch-pr.ts";
import { ensureRepo } from "../../workspace/repo-cache.ts";
import { extractDeltas, computeGroupStats } from "../../stack/delta.ts";
import { partitionGroups } from "../../stack/partition.ts";
import { applyCouplingRules } from "../../stack/coupling.ts";
import { splitOversizedGroups } from "../../stack/split.ts";
import { rebalanceGroups } from "../../stack/balance.ts";
import { mergeGroups, mergeEmptyGroups } from "../../stack/merge-groups.ts";
import { checkFeasibility } from "../../stack/feasibility.ts";
import { createStackPlan } from "../../stack/plan.ts";
import { executeStack } from "../../stack/execute.ts";
import { verifyStack } from "../../stack/verify.ts";
import { generatePrTitles } from "../../stack/pr-title.ts";
import { createLlmClient } from "../../llm/client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StackStatus = "running" | "done" | "error" | "canceled";
export type StackPhase = "partitioning" | "planning" | "executing" | "done";

export interface StackEvent {
	id: number;
	timestamp: number;
	phase: StackPhase;
	message: string;
}

export interface StackContext {
	repo_path: string;
	base_sha: string;
	head_sha: string;
	base_branch: string;
	head_branch: string;
	pr_number: number;
	owner: string;
	repo: string;
}

export interface StackPartitionData {
	ownership: Record<string, string>;
	reattributed: Array<{ path: string; from_groups: string[]; to_group: string; reason: string }>;
	warnings: string[];
	structured_warnings: StackWarning[];
	forced_merges: Array<{ path: string; from_group: string; to_group: string }>;
	groups: FileGroup[];
}

export interface StackPlanData {
	base_sha: string;
	head_sha: string;
	groups: StackPlan["groups"];
	expected_trees: Record<string, string>;
}

export interface StackVerifyData {
	verified: boolean;
	errors: string[];
	warnings: string[];
	structured_warnings: StackWarning[];
}

export interface StackStateSnapshot {
	status: StackStatus;
	phase: StackPhase | null;
	error: string | null;
	maxGroups: number | null;
	context: StackContext | null;
	partition: StackPartitionData | null;
	feasibility: FeasibilityResult | null;
	plan: StackPlanData | null;
	execResult: StackExecResult | null;
	verifyResult: StackVerifyData | null;
	startedAt: number;
	finishedAt: number | null;
}

interface StackSession {
	analysisSessionId: string;
	status: StackStatus;
	phase: StackPhase | null;
	error: string | null;
	maxGroups: number | null;
	context: StackContext | null;
	partition: StackPartitionData | null;
	feasibility: FeasibilityResult | null;
	plan: StackPlanData | null;
	execResult: StackExecResult | null;
	verifyResult: StackVerifyData | null;
	events: StackEvent[];
	subscribers: Set<(event: StackEvent | { type: "done" | "error"; data?: string }) => void>;
	startedAt: number;
	finishedAt: number | null;
	abortController: AbortController;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const sessions = new Map<string, StackSession>();

function emit(session: StackSession, phase: StackPhase, message: string): void {
	const event: StackEvent = {
		id: session.events.length,
		timestamp: Date.now(),
		phase,
		message,
	};
	session.events.push(event);
	for (const sub of session.subscribers) sub(event);
}

function toSnapshot(session: StackSession): StackStateSnapshot {
	return {
		status: session.status,
		phase: session.phase,
		error: session.error,
		maxGroups: session.maxGroups,
		context: session.context,
		partition: session.partition,
		feasibility: session.feasibility,
		plan: session.plan,
		execResult: session.execResult,
		verifyResult: session.verifyResult,
		startedAt: session.startedAt,
		finishedAt: session.finishedAt,
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStackSession(analysisSessionId: string): StackSession | undefined {
	return sessions.get(analysisSessionId);
}

export function getStackState(analysisSessionId: string): StackStateSnapshot | null {
	const session = sessions.get(analysisSessionId);
	if (!session) return null;
	return toSnapshot(session);
}

export function startStack(
	analysisSessionId: string,
	maxGroups: number | null,
	token: string,
	config: NewprConfig,
): { ok: true } | { error: string; status: number } {
	const existing = sessions.get(analysisSessionId);
	if (existing?.status === "running") {
		return { ok: true };
	}

	const session: StackSession = {
		analysisSessionId,
		status: "running",
		phase: null,
		error: null,
		maxGroups,
		context: null,
		partition: null,
		feasibility: null,
		plan: null,
		execResult: null,
		verifyResult: null,
		events: [],
		subscribers: new Set(),
		startedAt: Date.now(),
		finishedAt: null,
		abortController: new AbortController(),
	};
	sessions.set(analysisSessionId, session);

	runStackPipeline(session, token, config);

	return { ok: true };
}

export function cancelStack(analysisSessionId: string): boolean {
	const session = sessions.get(analysisSessionId);
	if (!session || session.status !== "running") return false;
	session.abortController.abort();
	session.status = "canceled";
	session.finishedAt = Date.now();
	for (const sub of session.subscribers) sub({ type: "error", data: "Canceled" });
	session.subscribers.clear();
	return true;
}

export function subscribeStack(
	analysisSessionId: string,
	callback: (event: StackEvent | { type: "done" | "error"; data?: string }) => void,
): (() => void) | null {
	const session = sessions.get(analysisSessionId);
	if (!session) return null;

	for (const past of session.events) callback(past);

	if (session.status === "done") {
		callback({ type: "done" });
		return () => {};
	}
	if (session.status === "error" || session.status === "canceled") {
		callback({ type: "error", data: session.error ?? undefined });
		return () => {};
	}

	session.subscribers.add(callback);
	return () => { session.subscribers.delete(callback); };
}

export async function restoreCompletedStacks(sessionIds: string[]): Promise<void> {
	for (const id of sessionIds) {
		if (sessions.has(id)) continue;
		const raw = await loadStackSidecar(id);
		if (!raw) continue;
		const snapshot = raw as unknown as StackStateSnapshot;

		const session: StackSession = {
			analysisSessionId: id,
			status: snapshot.status === "running" ? "error" : snapshot.status,
			phase: snapshot.phase,
			error: snapshot.status === "running" ? "Server restarted during stack pipeline" : snapshot.error,
			maxGroups: snapshot.maxGroups,
			context: snapshot.context,
			partition: snapshot.partition,
			feasibility: snapshot.feasibility,
			plan: snapshot.plan,
			execResult: snapshot.execResult,
			verifyResult: snapshot.verifyResult,
			events: [],
			subscribers: new Set(),
			startedAt: snapshot.startedAt,
			finishedAt: snapshot.finishedAt ?? Date.now(),
			abortController: new AbortController(),
		};
		sessions.set(id, session);
	}
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function runStackPipeline(
	session: StackSession,
	token: string,
	config: NewprConfig,
): Promise<void> {
	try {
		const stored = await loadSession(session.analysisSessionId);
		if (!stored) throw new Error("Analysis session not found");

		const prUrl = stored.meta.pr_url;
		const parsed = parsePrInput(prUrl);
		if (!parsed) throw new Error("Invalid PR URL in session");

		// ---- Partition phase ----
		session.phase = "partitioning";
		emit(session, "partitioning", "Fetching PR data...");

		const ghHeaders: Record<string, string> = {
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "newpr",
		};
		if (token) ghHeaders.Authorization = `token ${token}`;

		const prData = await fetchPrData(parsed, token);

		const prApiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;
		const prResp = await fetch(prApiUrl, { headers: ghHeaders });
		if (!prResp.ok) throw new Error("Failed to fetch PR data from GitHub");
		const prJson = await prResp.json() as Record<string, unknown>;
		const baseObj = prJson.base as Record<string, unknown>;
		const headObj = prJson.head as Record<string, unknown>;
		const baseSha = baseObj.sha as string;
		const headSha = headObj.sha as string;
		const baseBranch = baseObj.ref as string;
		const headBranch = headObj.ref as string;

		const repoPath = await ensureRepo(parsed.owner, parsed.repo, token, undefined, [baseSha, headSha]);

		session.context = {
			repo_path: repoPath,
			base_sha: baseSha,
			head_sha: headSha,
			base_branch: baseBranch,
			head_branch: headBranch,
			pr_number: parsed.number,
			owner: parsed.owner,
			repo: parsed.repo,
		};

		checkAborted(session);

		emit(session, "partitioning", "Extracting deltas...");
		const deltas = await extractDeltas(repoPath, baseSha, headSha);

		const analysisFiles = stored.files.map((f) => f.path);
		const fileSummaries = stored.files.map((f) => ({
			path: f.path,
			status: f.status,
			summary: f.summary,
		}));
		const deltaFilePaths = new Set<string>();
		for (const delta of deltas) {
			for (const change of delta.changes) {
				deltaFilePaths.add(change.path);
				if (change.old_path) deltaFilePaths.add(change.old_path);
			}
		}
		const analysisSet = new Set(analysisFiles);
		const deltaOnlyFiles = [...deltaFilePaths].filter((p) => !analysisSet.has(p));
		const changedFiles = [...analysisFiles, ...deltaOnlyFiles];

		emit(session, "partitioning", "Classifying files into groups...");
		const llmClient = createLlmClient({
			api_key: config.openrouter_api_key,
			model: config.model,
			timeout: config.timeout,
		});
		const partition = await partitionGroups(
			llmClient,
			stored.groups,
			changedFiles,
			fileSummaries,
			prData.commits,
		);

		checkAborted(session);

		const groupOrder = stored.groups.map((g) => g.name);
		const coupled = applyCouplingRules(partition.ownership, changedFiles, groupOrder);
		const mergedOwnership = new Map(coupled.ownership);
		const allWarnings = [...partition.warnings, ...coupled.warnings];
		const allStructuredWarnings: StackWarning[] = [...partition.structured_warnings, ...coupled.structured_warnings];

		buildReattributionWarnings(partition, analysisSet, allStructuredWarnings);

		const lastGroup = groupOrder[groupOrder.length - 1];
		if (lastGroup) {
			const backfilled: string[] = [];
			for (const path of deltaFilePaths) {
				if (!mergedOwnership.has(path)) {
					mergedOwnership.set(path, lastGroup);
					backfilled.push(path);
				}
			}
			if (backfilled.length > 0) {
				allWarnings.push(`Files still unassigned after AI classification, fallback to "${lastGroup}": ${backfilled.join(", ")}`);
				allStructuredWarnings.push({
					category: "assignment",
					severity: "warn",
					title: `${backfilled.length} file(s) fell back to last group`,
					message: `AI could not classify these files — assigned to "${lastGroup}" as fallback`,
					details: backfilled,
				});
			}
		}

		emit(session, "partitioning", "Splitting oversized groups...");
		const split = await splitOversizedGroups(llmClient, stored.groups, mergedOwnership);
		let currentGroups = split.groups;
		for (const [path, groupId] of split.ownership) {
			mergedOwnership.set(path, groupId);
		}
		allStructuredWarnings.push(...split.warnings);

		emit(session, "partitioning", "Rebalancing groups...");
		const balanced = await rebalanceGroups(llmClient, mergedOwnership, currentGroups);
		for (const [path, groupId] of balanced.ownership) {
			mergedOwnership.set(path, groupId);
		}
		allStructuredWarnings.push(...balanced.warnings);

		if (session.maxGroups && session.maxGroups > 0 && currentGroups.length > session.maxGroups) {
			const merged = mergeGroups(currentGroups, mergedOwnership, session.maxGroups);
			currentGroups = merged.groups;
			for (const [path, groupId] of merged.ownership) {
				mergedOwnership.set(path, groupId);
			}
			const mergeDetails: string[] = [];
			for (const m of merged.merges) {
				allWarnings.push(`Merged group "${m.absorbed}" into "${m.into}"`);
				mergeDetails.push(`"${m.absorbed}" → "${m.into}"`);
			}
			if (mergeDetails.length > 0) {
				allStructuredWarnings.push({
					category: "grouping",
					severity: "info",
					title: `${mergeDetails.length} group(s) merged to reduce PR count`,
					message: "Smaller groups were combined with adjacent ones to meet the max PRs limit",
					details: mergeDetails,
				});
			}
		}

		emit(session, "partitioning", "Checking feasibility...");
		const feasibility = checkFeasibility({ deltas, ownership: mergedOwnership });
		const ownershipObj = Object.fromEntries(mergedOwnership);

		session.partition = {
			ownership: ownershipObj,
			reattributed: partition.reattributed,
			warnings: allWarnings,
			structured_warnings: allStructuredWarnings,
			forced_merges: coupled.forced_merges,
			groups: currentGroups,
		};
		session.feasibility = feasibility;

		if (!feasibility.feasible) {
			throw new Error("Stacking is not feasible — dependency cycle detected");
		}

		checkAborted(session);

		// ---- Plan phase ----
		session.phase = "planning";
		emit(session, "planning", "Creating stack plan...");

		const ownership = new Map(Object.entries(ownershipObj));
		const plan = await createStackPlan({
			repo_path: repoPath,
			base_sha: baseSha,
			head_sha: headSha,
			deltas,
			ownership,
			group_order: feasibility.ordered_group_ids!,
			groups: currentGroups,
		});

		emit(session, "planning", "Computing group stats...");
		const groupStats = await computeGroupStats(
			repoPath,
			baseSha,
			feasibility.ordered_group_ids!,
			plan.expected_trees,
		);
		for (const group of plan.groups) {
			const s = groupStats.get(group.id);
			if (s) group.stats = s;
		}

		const emptyMerged = mergeEmptyGroups(plan.groups, ownership, plan.expected_trees);
		if (emptyMerged.merges.length > 0) {
			plan.groups = emptyMerged.groups;
			plan.expected_trees = emptyMerged.expectedTrees;
			for (const [path, groupId] of emptyMerged.ownership) {
				ownership.set(path, groupId);
			}
			const emptyDetails = emptyMerged.merges.map((m) => `"${m.absorbed}" → "${m.into}"`);
			allWarnings.push(`Merged ${emptyMerged.merges.length} empty group(s): ${emptyDetails.join(", ")}`);
			allStructuredWarnings.push({
				category: "grouping",
				severity: "info",
				title: `${emptyMerged.merges.length} empty group(s) merged`,
				message: "Groups with zero effective changes were absorbed into adjacent groups",
				details: emptyDetails,
			});
			emit(session, "planning", `Merged ${emptyMerged.merges.length} empty group(s)...`);

			session.partition = {
				...session.partition!,
				ownership: Object.fromEntries(ownership),
				warnings: allWarnings,
				structured_warnings: allStructuredWarnings,
			};
		}

		emit(session, "planning", "Generating PR titles...");
		const prTitles = await generatePrTitles(llmClient, plan.groups, stored.meta.pr_title, config.language);
		for (const group of plan.groups) {
			const title = prTitles.get(group.id);
			if (title) group.pr_title = title;
		}

		session.plan = {
			base_sha: plan.base_sha,
			head_sha: plan.head_sha,
			groups: plan.groups,
			expected_trees: Object.fromEntries(plan.expected_trees),
		};

		checkAborted(session);

		// ---- Execute phase ----
		session.phase = "executing";
		emit(session, "executing", "Building stack commits...");

		const execResult = await executeStack({
			repo_path: repoPath,
			plan,
			deltas,
			ownership,
			pr_author: {
				name: stored.meta.author,
				email: `${stored.meta.author}@users.noreply.github.com`,
			},
			pr_number: parsed.number,
			head_branch: headBranch,
		});

		emit(session, "executing", "Verifying tree equivalence...");
		const verifyResult = await verifyStack({
			repo_path: repoPath,
			base_sha: baseSha,
			head_sha: headSha,
			exec_result: execResult,
			ownership,
		});

		session.execResult = execResult;
		session.verifyResult = {
			verified: verifyResult.verified,
			errors: verifyResult.errors,
			warnings: verifyResult.warnings,
			structured_warnings: verifyResult.structured_warnings,
		};

		if (!verifyResult.verified) {
			throw new Error(`Verification failed: ${verifyResult.errors.join(", ")}`);
		}

		// ---- Done ----
		session.phase = "done";
		session.status = "done";
		session.finishedAt = Date.now();
		emit(session, "done", "Stack ready");

		for (const sub of session.subscribers) sub({ type: "done" });
		session.subscribers.clear();

		await saveStackSidecar(session.analysisSessionId, toSnapshot(session)).catch(() => {});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (session.status === "canceled") return;
		session.status = "error";
		session.error = msg;
		session.finishedAt = Date.now();

		for (const sub of session.subscribers) sub({ type: "error", data: msg });
		session.subscribers.clear();

		await saveStackSidecar(session.analysisSessionId, toSnapshot(session)).catch(() => {});
	}
}

function checkAborted(session: StackSession): void {
	if (session.abortController.signal.aborted) {
		throw new Error("Stack pipeline canceled");
	}
}

function buildReattributionWarnings(
	partition: { reattributed: Array<{ path: string; from_groups: string[]; to_group: string }> },
	analysisSet: Set<string>,
	warnings: StackWarning[],
): void {
	if (partition.reattributed.length === 0) return;

	const resolved = partition.reattributed.filter((r) => r.from_groups.length > 0);
	const assigned = partition.reattributed.filter((r) => r.from_groups.length === 0);

	if (resolved.length > 0) {
		warnings.push({
			category: "assignment",
			severity: "info",
			title: `${resolved.length} ambiguous file(s) resolved by AI`,
			message: "These files appeared in multiple groups — AI chose the best fit",
			details: resolved.map((r) => `${r.path} → ${r.to_group}`),
		});
	}
	if (assigned.length > 0) {
		const fromDelta = assigned.filter((r) => !analysisSet.has(r.path));
		const fromAnalysis = assigned.filter((r) => analysisSet.has(r.path));
		if (fromAnalysis.length > 0) {
			warnings.push({
				category: "assignment",
				severity: "info",
				title: `${fromAnalysis.length} unassigned file(s) placed by AI`,
				message: "These files were not in any group — AI assigned them",
				details: fromAnalysis.map((r) => `${r.path} → ${r.to_group}`),
			});
		}
		if (fromDelta.length > 0) {
			warnings.push({
				category: "assignment",
				severity: "info",
				title: `${fromDelta.length} file(s) from git diff classified by AI`,
				message: "These files were in the git diff but not in the analysis — AI assigned them to groups",
				details: fromDelta.map((r) => `${r.path} → ${r.to_group}`),
			});
		}
	}
}
