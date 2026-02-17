export interface PrIdentifier {
	owner: string;
	repo: string;
	number: number;
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
}
