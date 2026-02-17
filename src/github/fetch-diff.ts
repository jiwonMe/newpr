import type { PrIdentifier } from "../types/github.ts";

export async function fetchPrDiff(pr: PrIdentifier, token: string): Promise<string> {
	const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
	const response = await fetch(url, {
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github.v3.diff",
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

	return response.text();
}
