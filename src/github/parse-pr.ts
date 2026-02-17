import type { PrIdentifier } from "../types/github.ts";

const GITHUB_URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const OWNER_REPO_NUM_RE = /^([^/]+)\/([^#]+)#(\d+)$/;

export function parsePrInput(input: string, repoFlag?: string): PrIdentifier {
	const urlMatch = input.match(GITHUB_URL_RE);
	if (urlMatch) {
		return { owner: urlMatch[1]!, repo: urlMatch[2]!, number: Number(urlMatch[3]) };
	}

	const ownerRepoMatch = input.match(OWNER_REPO_NUM_RE);
	if (ownerRepoMatch) {
		return {
			owner: ownerRepoMatch[1]!,
			repo: ownerRepoMatch[2]!,
			number: Number(ownerRepoMatch[3]),
		};
	}

	const numberOnly = input.replace(/^#/, "");
	const prNumber = Number(numberOnly);
	if (!Number.isNaN(prNumber) && prNumber > 0 && Number.isInteger(prNumber)) {
		if (!repoFlag) {
			throw new Error(
				`PR number "${input}" requires --repo flag (e.g., --repo owner/repo)`,
			);
		}
		const parts = repoFlag.split("/");
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			throw new Error(`Invalid --repo format: "${repoFlag}". Expected "owner/repo".`);
		}
		return { owner: parts[0], repo: parts[1], number: prNumber };
	}

	throw new Error(
		`Cannot parse PR input: "${input}". Expected: URL, owner/repo#123, #123, or 123 with --repo`,
	);
}
