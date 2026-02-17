export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export type GroupType =
	| "feature"
	| "refactor"
	| "bugfix"
	| "chore"
	| "docs"
	| "test"
	| "config";

export type RiskLevel = "low" | "medium" | "high";

export interface PrMeta {
	pr_number: number;
	pr_title: string;
	pr_url: string;
	base_branch: string;
	head_branch: string;
	author: string;
	author_avatar?: string;
	author_url?: string;
	total_files_changed: number;
	total_additions: number;
	total_deletions: number;
	analyzed_at: string;
	model_used: string;
}

export interface PrSummary {
	purpose: string;
	scope: string;
	impact: string;
	risk_level: RiskLevel;
}

export interface FileGroup {
	name: string;
	type: GroupType;
	description: string;
	files: string[];
}

export interface FileChange {
	path: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	summary: string;
	groups: string[];
}

export interface NewprOutput {
	meta: PrMeta;
	summary: PrSummary;
	groups: FileGroup[];
	files: FileChange[];
	narrative: string;
}
