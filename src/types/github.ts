export interface PrIdentifier {
	owner: string;
	repo: string;
	number: number;
}

export interface PrCommit {
	sha: string;
	message: string;
	author: string;
	date: string;
	files: string[];
}

export interface PrComment {
	id: number;
	author: string;
	author_avatar?: string;
	body: string;
	created_at: string;
	updated_at: string;
	html_url: string;
}

export type PrState = "open" | "closed" | "merged" | "draft";

export interface GithubPrData {
	number: number;
	title: string;
	body: string;
	url: string;
	state: PrState;
	base_branch: string;
	head_branch: string;
	author: string;
	author_avatar?: string;
	author_url?: string;
	additions: number;
	deletions: number;
	changed_files: number;
	commits: PrCommit[];
}
