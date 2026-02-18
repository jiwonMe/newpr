import type { GithubPrData, PrComment, PrCommit, PrIdentifier, PrState } from "../types/github.ts";

export function mapPrResponse(json: Record<string, unknown>): Omit<GithubPrData, "commits"> {
	const user = json.user as Record<string, unknown> | undefined;
	const base = json.base as Record<string, unknown> | undefined;
	const head = json.head as Record<string, unknown> | undefined;

	let state: PrState = "open";
	if (json.draft) {
		state = "draft";
	} else if (json.merged) {
		state = "merged";
	} else if (json.state === "closed") {
		state = "closed";
	}

	return {
		number: json.number as number,
		title: json.title as string,
		body: (json.body as string) ?? "",
		url: json.html_url as string,
		state,
		base_branch: (base?.ref as string) ?? "unknown",
		head_branch: (head?.ref as string) ?? "unknown",
		author: (user?.login as string) ?? "unknown",
		author_avatar: (user?.avatar_url as string) ?? undefined,
		author_url: (user?.html_url as string) ?? undefined,
		additions: (json.additions as number) ?? 0,
		deletions: (json.deletions as number) ?? 0,
		changed_files: (json.changed_files as number) ?? 0,
	};
}

interface GithubCommitResponse {
	sha: string;
	commit: {
		message: string;
		author: { name: string; date: string };
	};
	files?: Array<{ filename: string }>;
}

export function mapCommitsResponse(items: GithubCommitResponse[]): PrCommit[] {
	return items.map((item) => ({
		sha: item.sha.slice(0, 8),
		message: item.commit.message,
		author: item.commit.author.name,
		date: item.commit.author.date,
		files: item.files?.map((f) => f.filename) ?? [],
	}));
}

async function githubGet(url: string, token: string): Promise<Response> {
	const response = await fetch(url, {
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "newpr-cli",
		},
	});

	if (response.status === 404) {
		throw new Error(`Not found: ${url}`);
	}
	if (response.status === 401 || response.status === 403) {
		throw new Error("GitHub authentication failed. Check your token permissions.");
	}
	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
	}

	return response;
}

export async function fetchPrCommits(pr: PrIdentifier, token: string): Promise<PrCommit[]> {
	const allCommits: GithubCommitResponse[] = [];
	let page = 1;

	while (true) {
		const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/commits?per_page=100&page=${page}`;
		const response = await githubGet(url, token);
		const items = (await response.json()) as GithubCommitResponse[];
		if (items.length === 0) break;
		allCommits.push(...items);
		if (items.length < 100) break;
		page++;
	}

	return mapCommitsResponse(allCommits);
}

export async function fetchPrData(pr: PrIdentifier, token: string): Promise<GithubPrData> {
	const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
	const response = await githubGet(url, token);
	const json = (await response.json()) as Record<string, unknown>;
	const base = mapPrResponse(json);

	const commits = await fetchPrCommits(pr, token);

	return { ...base, commits };
}

interface GithubCommentResponse {
	id: number;
	user: { login: string; avatar_url?: string } | null;
	body: string;
	created_at: string;
	updated_at: string;
	html_url: string;
}

export async function fetchPrComments(pr: PrIdentifier, token: string): Promise<PrComment[]> {
	const allComments: GithubCommentResponse[] = [];
	let page = 1;

	while (true) {
		const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100&page=${page}`;
		const response = await githubGet(url, token);
		const items = (await response.json()) as GithubCommentResponse[];
		if (items.length === 0) break;
		allComments.push(...items);
		if (items.length < 100) break;
		page++;
	}

	return allComments.map((c) => ({
		id: c.id,
		author: c.user?.login ?? "unknown",
		author_avatar: c.user?.avatar_url ?? undefined,
		body: c.body,
		created_at: c.created_at,
		updated_at: c.updated_at,
		html_url: c.html_url,
	}));
}

export async function fetchPrBody(pr: PrIdentifier, token: string): Promise<string> {
	const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
	const response = await githubGet(url, token);
	const json = (await response.json()) as Record<string, unknown>;
	return (json.body as string) ?? "";
}
