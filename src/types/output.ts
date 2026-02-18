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

export type PrStateLabel = "open" | "closed" | "merged" | "draft";

export interface PrMeta {
	pr_number: number;
	pr_title: string;
	pr_body?: string;
	pr_url: string;
	pr_state?: PrStateLabel;
	pr_updated_at?: string;
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
	key_changes?: string[];
	risk?: string;
	dependencies?: string[];
}

export interface FileChange {
	path: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	summary: string;
	groups: string[];
}

export interface CartoonImage {
	imageBase64: string;
	mimeType: string;
	generatedAt: string;
}

export interface DiffComment {
	id: string;
	sessionId: string;
	filePath: string;
	line: number;
	startLine?: number;
	side: "old" | "new";
	body: string;
	author: string;
	authorAvatar?: string;
	createdAt: string;
	githubUrl?: string;
	githubCommentId?: number;
}

export interface PendingComment {
	tempId: string;
	filePath: string;
	line: number;
	side: "old" | "new";
	body: string;
}

export interface ChatToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	result?: string;
}

export type ChatSegment =
	| { type: "text"; content: string }
	| { type: "tool_call"; toolCall: ChatToolCall };

export interface ChatMessage {
	role: "user" | "assistant" | "tool";
	content: string;
	toolCalls?: ChatToolCall[];
	segments?: ChatSegment[];
	toolCallId?: string;
	timestamp: string;
	isCompactSummary?: boolean;
	compactedCount?: number;
}

export interface SlideImage {
	index: number;
	imageBase64: string;
	mimeType: string;
	title: string;
}

export interface SlideSpec {
	index: number;
	title: string;
	contentPrompt: string;
}

export interface SlidePlan {
	stylePrompt: string;
	slides: SlideSpec[];
}

export interface SlideDeck {
	slides: SlideImage[];
	plan?: SlidePlan;
	failedIndices?: number[];
	generatedAt: string;
}

export interface NewprOutput {
	meta: PrMeta;
	summary: PrSummary;
	groups: FileGroup[];
	files: FileChange[];
	narrative: string;
	cartoon?: CartoonImage;
}
