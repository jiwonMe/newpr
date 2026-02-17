import type { DiffChunk, ParsedDiff } from "../types/diff.ts";

const DEFAULT_MAX_TOKENS = 8000;

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function chunkDiff(parsed: ParsedDiff, maxTokensPerChunk = DEFAULT_MAX_TOKENS): DiffChunk[] {
	return parsed.files.map((file) => {
		let diffContent = file.raw;
		let tokens = estimateTokens(diffContent);

		if (tokens > maxTokensPerChunk) {
			const maxChars = maxTokensPerChunk * 4;
			diffContent = `${diffContent.slice(0, maxChars)}\n\n... [truncated: ${tokens} estimated tokens, limit ${maxTokensPerChunk}]`;
			tokens = estimateTokens(diffContent);
		}

		return {
			file_path: file.path,
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
			is_binary: file.is_binary,
			diff_content: diffContent,
			estimated_tokens: tokens,
		};
	});
}
