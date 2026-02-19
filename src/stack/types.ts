import type { FileGroup, GroupType } from "../types/output.ts";
import type { PrCommit } from "../types/github.ts";

// ============================================================================
// Input Types
// ============================================================================

export interface StackInput {
	session_id: string;
	pr_number: number;
	base_sha: string;
	head_sha: string;
	repo_path: string;
	groups: FileGroup[];
	commits: PrCommit[];
	changed_files: string[];
}

// ============================================================================
// Partition Types
// ============================================================================

export interface ReattributedFile {
	path: string;
	from_groups: string[];
	to_group: string;
	reason: string;
}

export interface PartitionResult {
	ownership: Map<string, string>; // path -> groupId
	reattributed: ReattributedFile[];
	shared_foundation_group?: FileGroup;
	warnings: string[];
	structured_warnings: StackWarning[];
}

// ============================================================================
// Delta Types
// ============================================================================

export type DeltaStatus = "A" | "M" | "D" | "R";

export interface DeltaFileChange {
	status: DeltaStatus;
	path: string;
	old_path?: string;
	old_blob: string;
	new_blob: string;
	old_mode: string;
	new_mode: string;
}

export interface DeltaEntry {
	sha: string;
	parent_sha: string;
	author: string;
	date: string;
	message: string;
	changes: DeltaFileChange[];
}

// ============================================================================
// Feasibility Types
// ============================================================================

export type ConstraintKind = "dependency" | "path-order" | "unassigned" | "ambiguous";

export interface ConstraintEvidence {
	path: string;
	from_commit?: string;
	to_commit?: string;
	from_commit_index?: number;
	to_commit_index?: number;
}

export interface ConstraintEdge {
	from: string; // groupId
	to: string; // groupId
	kind: ConstraintKind;
	evidence?: ConstraintEvidence;
}

export interface CycleReport {
	group_cycle: string[]; // [groupId, ...]
	edge_cycle: ConstraintEdge[];
}

export interface FeasibilityResult {
	feasible: boolean;
	ordered_group_ids?: string[];
	dependency_edges?: Array<{ from: string; to: string }>;
	cycle?: CycleReport;
	unassigned_paths?: Array<{ path: string; commits: string[] }>;
	ambiguous_paths?: Array<{ path: string; groups: string[]; commits: string[] }>;
}

// ============================================================================
// Plan Types
// ============================================================================

export interface StackGroupStats {
	additions: number;
	deletions: number;
	files_added: number;
	files_modified: number;
	files_deleted: number;
}

export interface StackGroup {
	id: string;
	name: string;
	type: GroupType;
	description: string;
	files: string[];
	deps: string[]; // groupIds
	order: number;
	stats?: StackGroupStats;
	pr_title?: string;
}

export interface StackPlan {
	base_sha: string;
	head_sha: string;
	groups: StackGroup[];
	expected_trees: Map<string, string>;
	ancestor_sets: Map<string, string[]>;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface GroupCommitInfo {
	group_id: string;
	commit_sha: string;
	tree_sha: string;
	branch_name: string;
	pr_title?: string;
}

export interface StackExecResult {
	run_id: string;
	source_copy_branch: string;
	group_commits: GroupCommitInfo[];
	final_tree_sha: string;
	verified: boolean;
}

// ============================================================================
// Publication Types
// ============================================================================

export interface BranchInfo {
	name: string;
	pushed: boolean;
}

export interface PrInfo {
	group_id: string;
	number: number;
	url: string;
	title: string;
	base_branch: string;
	head_branch: string;
	dep_group_ids?: string[];
}

export interface StackPublishResult {
	branches: BranchInfo[];
	prs: PrInfo[];
}

// ============================================================================
// Structured Warnings
// ============================================================================

export type StackWarningCategory =
	| "assignment"
	| "grouping"
	| "coupling"
	| "verification.scope"
	| "verification.completeness"
	| "system";

export type StackWarningSeverity = "info" | "warn";

export interface StackWarning {
	category: StackWarningCategory;
	severity: StackWarningSeverity;
	title: string;
	message: string;
	details?: string[];
}

// ============================================================================
// Progress Types
// ============================================================================

export interface StackProgress {
	phase: string;
	message: string;
	current?: number;
	total?: number;
}
