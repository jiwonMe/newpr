import type { GithubPrData, PrIdentifier } from "../types/github.ts";

export function mapPrResponse(json: Record<string, unknown>): GithubPrData {
	const user = json.user as Record<string, unknown> | undefined;
	const base = json.base as Record<string, unknown> | undefined;
	const head = json.head as Record<string, unknown> | undefined;

	return {
		number: json.number as number,
		title: json.title as string,
		url: json.html_url as string,
		base_branch: (base?.ref as string) ?? "unknown",
		head_branch: (head?.ref as string) ?? "unknown",
		author: (user?.login as string) ?? "unknown",
		additions: (json.additions as number) ?? 0,
		deletions: (json.deletions as number) ?? 0,
		changed_files: (json.changed_files as number) ?? 0,
	};
}

export async function fetchPrData(pr: PrIdentifier, token: string): Promise<GithubPrData> {
	const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
	const response = await fetch(url, {
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "newpr-cli",
		},
	});

	if (response.status === 404) {
		throw new Error(`PR not found: ${pr.owner}/${pr.repo}#${pr.number}`);
	}
	if (response.status === 401 || response.status === 403) {
		throw new Error(`GitHub authentication failed. Check your token permissions.`);
	}
	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as Record<string, unknown>;
	return mapPrResponse(json);
}
