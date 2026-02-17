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

export interface GithubPrData {
	number: number;
	title: string;
	url: string;
	base_branch: string;
	head_branch: string;
	author: string;
	additions: number;
	deletions: number;
	changed_files: number;
	commits: PrCommit[];
}
