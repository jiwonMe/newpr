export interface SessionRecord {
	id: string;
	pr_url: string;
	pr_number: number;
	pr_title: string;
	repo: string;
	author: string;
	analyzed_at: string;
	risk_level: string;
	total_files: number;
	total_additions: number;
	total_deletions: number;
	summary_purpose: string;
	data_path: string;
}
