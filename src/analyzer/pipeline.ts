import type { NewprConfig } from "../types/config.ts";
import type { DiffChunk } from "../types/diff.ts";
import type { PrIdentifier } from "../types/github.ts";
import type { FileChange, FileGroup, NewprOutput, PrSummary } from "../types/output.ts";
import { parseDiff } from "../diff/parser.ts";
import { chunkDiff } from "../diff/chunker.ts";
import { fetchPrData } from "../github/fetch-pr.ts";
import { fetchPrDiff } from "../github/fetch-diff.ts";
import { createLlmClient, type LlmClient } from "../llm/client.ts";
import {
	buildFileSummaryPrompt,
	buildGroupingPrompt,
	buildOverallSummaryPrompt,
	buildNarrativePrompt,
	type FileSummaryInput,
} from "../llm/prompts.ts";
import {
	parseFileSummaries,
	parseGroups,
	parseSummary,
	parseNarrative,
} from "../llm/response-parser.ts";
import type { ProgressCallback } from "./progress.ts";
import { createSilentProgress } from "./progress.ts";

interface PipelineOptions {
	pr: PrIdentifier;
	token: string;
	config: NewprConfig;
	onProgress?: ProgressCallback;
}

async function analyzeFileChunkBatch(
	client: LlmClient,
	chunks: DiffChunk[],
): Promise<Array<{ path: string; summary: string }>> {
	const { system, user } = buildFileSummaryPrompt(chunks);
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

export async function analyzePr(options: PipelineOptions): Promise<NewprOutput> {
	const { pr, token, config } = options;
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

	progress({
		stage: "analyzing",
		message: `Analyzing ${chunks.length} files${wasTruncated ? ` (${allChunks.length - config.max_files} files skipped)` : ""}...`,
	});

	const fileBatchSize = 10;
	const batches = batchChunks(chunks, fileBatchSize);
	const allFileSummaries: Array<{ path: string; summary: string }> = [];

	for (let i = 0; i < batches.length; i++) {
		progress({
			stage: "analyzing",
			message: "Analyzing files...",
			current: Math.min((i + 1) * fileBatchSize, chunks.length),
			total: chunks.length,
		});

		const concurrentBatches = batches.slice(i, i + config.concurrency);
		const results = await Promise.all(
			concurrentBatches.map((batch) => analyzeFileChunkBatch(client, batch)),
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

	const { system: groupSystem, user: groupUser } = buildGroupingPrompt(fileSummaryInputs);
	const groupResponse = await client.complete(groupSystem, groupUser);
	const groups: FileGroup[] = parseGroups(groupResponse.content);

	progress({ stage: "summarizing", message: "Generating overall summary..." });
	const { system: summarySystem, user: summaryUser } = buildOverallSummaryPrompt(
		prData.title,
		groups,
		allFileSummaries,
	);
	const summaryResponse = await client.complete(summarySystem, summaryUser);
	const summary: PrSummary = parseSummary(summaryResponse.content);

	progress({ stage: "narrating", message: "Writing change narrative..." });
	const { system: narrativeSystem, user: narrativeUser } = buildNarrativePrompt(
		prData.title,
		summary,
		groups,
	);
	const narrativeResponse = await client.complete(narrativeSystem, narrativeUser);
	const narrative = parseNarrative(narrativeResponse.content);

	progress({ stage: "done", message: "Analysis complete." });

	const fileGroupMap = new Map<string, string>();
	for (const group of groups) {
		for (const filePath of group.files) {
			fileGroupMap.set(filePath, group.name);
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
			group: fileGroupMap.get(chunk.file_path) ?? "Ungrouped",
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
