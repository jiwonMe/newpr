import type { NewprConfig } from "../types/config.ts";
import type { DiffChunk } from "../types/diff.ts";
import type { PrIdentifier } from "../types/github.ts";
import type { FileChange, FileGroup, NewprOutput, PrSummary } from "../types/output.ts";
import type { ExplorationResult } from "../workspace/types.ts";
import type { AgentToolName } from "../workspace/types.ts";
import { parseDiff } from "../diff/parser.ts";
import { chunkDiff } from "../diff/chunker.ts";
import { fetchPrData } from "../github/fetch-pr.ts";
import { fetchPrDiff } from "../github/fetch-diff.ts";
import { createLlmClient, type LlmClient, type LlmResponse } from "../llm/client.ts";
import {
	buildFileSummaryPrompt,
	buildGroupingPrompt,
	buildOverallSummaryPrompt,
	buildNarrativePrompt,
	buildEnrichedSummaryPrompt,
	buildEnrichedNarrativePrompt,
	type FileSummaryInput,
	type PromptContext,
} from "../llm/prompts.ts";
import {
	parseFileSummaries,
	parseGroups,
	parseSummary,
	parseNarrative,
} from "../llm/response-parser.ts";
import { ensureRepo } from "../workspace/repo-cache.ts";
import { createWorktrees, cleanupWorktrees } from "../workspace/worktree.ts";
import { requireAgent } from "../workspace/agent.ts";
import { exploreCodebase } from "../workspace/explore.ts";
import type { ProgressCallback, ProgressStage } from "./progress.ts";
import { createSilentProgress } from "./progress.ts";

async function streamLlmCall(
	client: LlmClient,
	system: string,
	user: string,
	stage: ProgressStage,
	message: string,
	progress: ProgressCallback,
): Promise<LlmResponse> {
	return client.completeStream(system, user, (_chunk, accumulated) => {
		progress({ stage, message, partial_content: accumulated });
	});
}

interface PipelineOptions {
	pr: PrIdentifier;
	token: string;
	config: NewprConfig;
	onProgress?: ProgressCallback;
	noClone?: boolean;
	preferredAgent?: AgentToolName;
}

async function analyzeFileChunkBatch(
	client: LlmClient,
	chunks: DiffChunk[],
	ctx?: import("../llm/prompts.ts").PromptContext,
): Promise<Array<{ path: string; summary: string }>> {
	const { system, user } = buildFileSummaryPrompt(chunks, ctx);
	const response = await client.complete(system, user);
	return parseFileSummaries(response.content);
}

function batchChunks(chunks: DiffChunk[], batchSize: number): DiffChunk[][] {
	const batches: DiffChunk[][] = [];
	for (let i = 0; i < chunks.length; i += batchSize) {
		batches.push(chunks.slice(i, i + batchSize));
	}
	return batches;
}

async function tryExploreCodebase(
	pr: PrIdentifier,
	token: string,
	baseBranch: string,
	changedFiles: string[],
	prTitle: string,
	rawDiff: string,
	preferredAgent?: AgentToolName,
	onProgress?: ProgressCallback,
): Promise<ExplorationResult | null> {
	try {
		const agent = await requireAgent(preferredAgent);

		onProgress?.({ stage: "cloning", message: `Preparing ${pr.owner}/${pr.repo}...` });
		const bareRepoPath = await ensureRepo(pr.owner, pr.repo, token, (msg) => {
			onProgress?.({ stage: "cloning", message: msg });
		});

		onProgress?.({ stage: "checkout", message: "Setting up PR worktrees..." });
		const worktrees = await createWorktrees(
			bareRepoPath, baseBranch, pr.number, pr.owner, pr.repo,
			(msg) => onProgress?.({ stage: "checkout", message: msg }),
		);

		onProgress?.({ stage: "exploring", message: "Exploring codebase with agent..." });
		const exploration = await exploreCodebase(
			agent, worktrees.headPath, changedFiles, prTitle, rawDiff,
			(msg, current, total) => onProgress?.({ stage: "exploring", message: msg, current, total }),
		);

		await cleanupWorktrees(bareRepoPath, pr.number, pr.owner, pr.repo).catch(() => {});

		return exploration;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		onProgress?.({ stage: "exploring", message: `Skipping codebase exploration: ${msg}` });
		return null;
	}
}

export async function analyzePr(options: PipelineOptions): Promise<NewprOutput> {
	const { pr, token, config, noClone, preferredAgent } = options;
	const progress = options.onProgress ?? createSilentProgress();
	const client = createLlmClient({
		api_key: config.openrouter_api_key,
		model: config.model,
		timeout: config.timeout,
	});

	progress({ stage: "fetching", message: "Fetching PR data and diff..." });
	const [prData, rawDiff] = await Promise.all([
		fetchPrData(pr, token),
		fetchPrDiff(pr, token),
	]);

	progress({ stage: "parsing", message: "Parsing diff..." });
	const parsed = parseDiff(rawDiff);
	const allChunks = chunkDiff(parsed);
	const chunks = allChunks.slice(0, config.max_files);
	const wasTruncated = allChunks.length > config.max_files;
	const changedFiles = chunks.map((c) => c.file_path);

	let exploration: ExplorationResult | null = null;
	if (!noClone) {
		exploration = await tryExploreCodebase(
			pr, token, prData.base_branch, changedFiles, prData.title, rawDiff,
			preferredAgent, progress,
		);
	}

	const promptCtx: PromptContext = { commits: prData.commits, language: config.language };

	progress({
		stage: "analyzing",
		message: `Analyzing ${chunks.length} files${wasTruncated ? ` (${allChunks.length - config.max_files} skipped)` : ""}${exploration ? " (with codebase context)" : ""}...`,
	});

	const fileBatchSize = 10;
	const batches = batchChunks(chunks, fileBatchSize);
	const allFileSummaries: Array<{ path: string; summary: string }> = [];

	for (let i = 0; i < batches.length; i++) {
		const batchFiles = batches.slice(i, i + config.concurrency)
			.flat()
			.map((c) => c.file_path.split("/").pop() ?? c.file_path);
		progress({
			stage: "analyzing",
			message: `Analyzing: ${batchFiles.join(", ")}`,
			current: Math.min((i + 1) * fileBatchSize, chunks.length),
			total: chunks.length,
		});

		const concurrentBatches = batches.slice(i, i + config.concurrency);
		const results = await Promise.all(
			concurrentBatches.map((batch) => analyzeFileChunkBatch(client, batch, promptCtx)),
		);
		allFileSummaries.push(...results.flat());
		i += config.concurrency - 1;
	}

	progress({ stage: "grouping", message: "Grouping files by semantic purpose..." });
	const fileSummaryInputs: FileSummaryInput[] = chunks.map((chunk) => {
		const summary = allFileSummaries.find((s) => s.path === chunk.file_path);
		return {
			path: chunk.file_path,
			summary: summary?.summary ?? "No summary available",
			status: chunk.status,
		};
	});

	const { system: groupSystem, user: groupUser } = buildGroupingPrompt(fileSummaryInputs, promptCtx);
	const groupResponse = await streamLlmCall(
		client, groupSystem, groupUser, "grouping", "Grouping files...", progress,
	);
	const groups: FileGroup[] = parseGroups(groupResponse.content);

	const summaryLabel = `Generating overall summary${exploration ? " (enriched)" : ""}...`;
	progress({ stage: "summarizing", message: summaryLabel });
	const summaryPrompt = exploration
		? buildEnrichedSummaryPrompt(prData.title, groups, allFileSummaries, exploration, promptCtx)
		: buildOverallSummaryPrompt(prData.title, groups, allFileSummaries, promptCtx);
	const summaryResponse = await streamLlmCall(
		client, summaryPrompt.system, summaryPrompt.user, "summarizing", summaryLabel, progress,
	);
	const summary: PrSummary = parseSummary(summaryResponse.content);

	const narrativeLabel = `Writing change narrative${exploration ? " (enriched)" : ""}...`;
	progress({ stage: "narrating", message: narrativeLabel });
	const narrativePrompt = exploration
		? buildEnrichedNarrativePrompt(prData.title, summary, groups, exploration, promptCtx)
		: buildNarrativePrompt(prData.title, summary, groups, promptCtx);
	const narrativeResponse = await streamLlmCall(
		client, narrativePrompt.system, narrativePrompt.user, "narrating", narrativeLabel, progress,
	);
	const narrative = parseNarrative(narrativeResponse.content);

	progress({ stage: "done", message: "Analysis complete." });

	const fileGroupsMap = new Map<string, string[]>();
	for (const group of groups) {
		for (const filePath of group.files) {
			const existing = fileGroupsMap.get(filePath) ?? [];
			existing.push(group.name);
			fileGroupsMap.set(filePath, existing);
		}
	}

	const files: FileChange[] = chunks.map((chunk) => {
		const summaryEntry = allFileSummaries.find((s) => s.path === chunk.file_path);
		return {
			path: chunk.file_path,
			status: chunk.status,
			additions: chunk.additions,
			deletions: chunk.deletions,
			summary: summaryEntry?.summary ?? "No summary available",
			groups: fileGroupsMap.get(chunk.file_path) ?? ["Ungrouped"],
		};
	});

	return {
		meta: {
			pr_number: prData.number,
			pr_title: prData.title,
			pr_url: prData.url,
			base_branch: prData.base_branch,
			head_branch: prData.head_branch,
			author: prData.author,
			total_files_changed: prData.changed_files,
			total_additions: prData.additions,
			total_deletions: prData.deletions,
			analyzed_at: new Date().toISOString(),
			model_used: config.model,
		},
		summary,
		groups,
		files,
		narrative,
	};
}
