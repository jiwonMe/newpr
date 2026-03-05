import type {
	DeltaEntry,
	StackPlan,
	StackExecResult,
	GroupCommitInfo,
} from "./types.ts";
import { buildAncestorSets } from "./plan.ts";

export class StackExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StackExecutionError";
	}
}

export interface ExecuteInput {
	repo_path: string;
	plan: StackPlan;
	deltas: DeltaEntry[];
	ownership: Map<string, string>;
	pr_author: { name: string; email: string };
	pr_number: number;
	head_branch: string;
}

function generateAlphanumericId(length = 6): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}

function slugifyBranchPart(value: string | undefined, fallback: string, maxLen: number): string {
	const normalized = (value ?? "")
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, "");

	const slug = normalized
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, maxLen)
		.replace(/-+$/g, "");

	return slug || fallback;
}

function buildStackBranchName(prNumber: number, headBranch: string, group: StackPlan["groups"][number]): string {
	const sourceSlug = slugifyBranchPart(headBranch, "source", 24);
	const typeSlug = slugifyBranchPart(group.type, "group", 16);
	const topicSource = group.pr_title ?? group.name ?? group.description;
	const topicSlug = slugifyBranchPart(topicSource, `group-${group.order}`, 36);
	const orderSlug = String(group.order).padStart(2, "0");
	const randomSuffix = generateAlphanumericId(6);
	return `newpr-stack/pr-${prNumber}/${sourceSlug}/${orderSlug}-${typeSlug}-${topicSlug}-${randomSuffix}`;
}

export async function executeStack(input: ExecuteInput): Promise<StackExecResult> {
	const { repo_path, plan, deltas, ownership, pr_author, pr_number, head_branch } = input;

	const runId = `newpr-stack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const tmpIndexFiles: string[] = [];
	const createdRefs: string[] = [];

	const copyBranch = `newpr/stack-source/pr-${pr_number}`;
	const copyRef = `refs/heads/${copyBranch}`;
	const createCopy = await Bun.$`git -C ${repo_path} update-ref ${copyRef} ${plan.head_sha}`.quiet().nothrow();
	if (createCopy.exitCode !== 0) {
		throw new StackExecutionError(
			`Failed to create source copy branch ${copyBranch}: ${createCopy.stderr.toString().trim()}`,
		);
	}
	createdRefs.push(copyRef);

	const groupOrder = plan.groups.map((g) => g.id);
	const groupRank = new Map<string, number>();
	groupOrder.forEach((gid, idx) => groupRank.set(gid, idx));

	const ancestorSets = new Map<string, Set<string>>();
	if (plan.ancestor_sets && plan.ancestor_sets.size > 0) {
		for (const [gid, ancestors] of plan.ancestor_sets) {
			ancestorSets.set(gid, new Set(ancestors));
		}
	} else {
		const groupIdSet = new Set(groupOrder);
		const dagParents = new Map<string, string[]>();
		for (const g of plan.groups) {
			dagParents.set(g.id, (g.deps ?? []).filter((dep) => groupIdSet.has(dep)));
		}
		for (const [gid, set] of buildAncestorSets(groupOrder, dagParents)) {
			ancestorSets.set(gid, set);
		}
	}

	const allDeps = new Set<string>();
	for (const g of plan.groups) {
		for (const dep of g.deps ?? []) allDeps.add(dep);
	}
	const leafGroups = groupOrder.filter((gid) => !allDeps.has(gid));
	const hasMultipleLeaves = leafGroups.length > 1;
	const allChangesIdxSlot = hasMultipleLeaves ? groupOrder.length : -1;
	const totalIndexSlots = hasMultipleLeaves ? groupOrder.length + 1 : groupOrder.length;

	try {
		for (let i = 0; i < totalIndexSlots; i++) {
			const idxFile = `/tmp/newpr-exec-idx-${runId}-${i}`;
			tmpIndexFiles.push(idxFile);

			const readTree = await Bun.$`GIT_INDEX_FILE=${idxFile} git -C ${repo_path} read-tree ${plan.base_sha}`.quiet().nothrow();
			if (readTree.exitCode !== 0) {
				throw new StackExecutionError(
					`Failed to initialize index ${i}: ${readTree.stderr.toString().trim()}`,
				);
			}
		}

		for (const delta of deltas) {
			const batchPerIndex = new Map<number, string[]>();

			for (const change of delta.changes) {
				const fileGroupId = ownership.get(change.path);
				if (!fileGroupId) continue;

				const fileRank = groupRank.get(fileGroupId);
				if (fileRank === undefined) continue;

			const addToBatch = (idxNum: number) => {
				let batch = batchPerIndex.get(idxNum);
				if (!batch) {
					batch = [];
					batchPerIndex.set(idxNum, batch);
				}
				if (change.status === "D") {
					batch.push(`0 ${"0".repeat(40)}\t${change.path}`);
				} else if (change.status === "R") {
					if (change.old_path) {
						batch.push(`0 ${"0".repeat(40)}\t${change.old_path}`);
					}
					batch.push(`${change.new_mode} ${change.new_blob}\t${change.path}`);
				} else {
					batch.push(`${change.new_mode} ${change.new_blob}\t${change.path}`);
				}
			};

			for (let idxNum = 0; idxNum < groupOrder.length; idxNum++) {
				const targetGroupId = groupOrder[idxNum]!;
				const isOwner = targetGroupId === fileGroupId;
				const isAncestorOfOwner = ancestorSets.get(targetGroupId)?.has(fileGroupId) ?? false;
				if (!isOwner && !isAncestorOfOwner) continue;
				addToBatch(idxNum);
			}

			if (allChangesIdxSlot >= 0) {
				addToBatch(allChangesIdxSlot);
			}
			}

			for (const [idxNum, lines] of batchPerIndex) {
				const idxFile = tmpIndexFiles[idxNum];
				if (!idxFile || lines.length === 0) continue;

				const stdinData = lines.join("\n") + "\n";
				const updateIdx = await Bun.$`echo ${stdinData} | GIT_INDEX_FILE=${idxFile} git -C ${repo_path} update-index --index-info`.quiet().nothrow();
				if (updateIdx.exitCode !== 0) {
					throw new StackExecutionError(
						`update-index failed for index ${idxNum}: ${updateIdx.stderr.toString().trim()}`,
					);
				}
			}
		}

		const groupCommits: GroupCommitInfo[] = [];
		const commitBySha = new Map<string, string>();

		for (let i = 0; i < groupOrder.length; i++) {
			const idxFile = tmpIndexFiles[i];
			const gid = groupOrder[i];
			const group = plan.groups[i];
			if (!idxFile || !gid || !group) continue;

			const writeTree = await Bun.$`GIT_INDEX_FILE=${idxFile} git -C ${repo_path} write-tree`.quiet().nothrow();
			if (writeTree.exitCode !== 0) {
				throw new StackExecutionError(
					`write-tree failed for group ${gid}: ${writeTree.stderr.toString().trim()}`,
				);
			}
			const treeSha = writeTree.stdout.toString().trim();

			const expectedTree = plan.expected_trees.get(gid);
			if (expectedTree && treeSha !== expectedTree) {
				console.warn(
					`[stack] Tree mismatch for group "${gid}": expected ${expectedTree}, got ${treeSha}. Continuing with computed tree.`,
				);
				plan.expected_trees.set(gid, treeSha);
			}

			const commitMessage = group.pr_title ?? `${group.type}(${group.name}): ${group.description}`;

			const deps = Array.from(new Set((group.deps ?? []).filter((dep) => dep !== gid)));
			const directParents = deps.length > 0
				? deps.map((dep) => {
					const parentCommit = commitBySha.get(dep);
					if (!parentCommit) {
						throw new StackExecutionError(
							`Missing parent commit for dependency "${dep}" of group "${gid}"`,
						);
					}
					return parentCommit;
				})
				: [plan.base_sha];

			const parentArgs = directParents.flatMap((p) => ["-p", p]);

			const commitTree = await Bun.$`git -C ${repo_path} commit-tree ${treeSha} ${parentArgs} -m ${commitMessage}`.env({
				GIT_AUTHOR_NAME: pr_author.name,
				GIT_AUTHOR_EMAIL: pr_author.email,
				GIT_COMMITTER_NAME: pr_author.name,
				GIT_COMMITTER_EMAIL: pr_author.email,
			}).quiet().nothrow();

			if (commitTree.exitCode !== 0) {
				throw new StackExecutionError(
					`commit-tree failed for group ${gid}: ${commitTree.stderr.toString().trim()}`,
				);
			}
			const commitSha = commitTree.stdout.toString().trim();
			commitBySha.set(gid, commitSha);

			const branchName = buildStackBranchName(pr_number, head_branch, group);

			const updateRef = await Bun.$`git -C ${repo_path} update-ref refs/heads/${branchName} ${commitSha}`.quiet().nothrow();
			if (updateRef.exitCode !== 0) {
				throw new StackExecutionError(
					`update-ref failed for branch ${branchName}: ${updateRef.stderr.toString().trim()}`,
				);
			}
			createdRefs.push(`refs/heads/${branchName}`);

			groupCommits.push({
				group_id: gid,
				commit_sha: commitSha,
				tree_sha: treeSha,
				branch_name: branchName,
				pr_title: group.pr_title,
			});
		}

		let finalTreeSha: string;
		if (allChangesIdxSlot >= 0) {
			const allChangesIdxFile = tmpIndexFiles[allChangesIdxSlot];
			if (!allChangesIdxFile) throw new StackExecutionError("Missing all-changes index file");
			const writeAllTree = await Bun.$`GIT_INDEX_FILE=${allChangesIdxFile} git -C ${repo_path} write-tree`.quiet().nothrow();
			if (writeAllTree.exitCode !== 0) {
				throw new StackExecutionError(`write-tree failed for all-changes index: ${writeAllTree.stderr.toString().trim()}`);
			}
			finalTreeSha = writeAllTree.stdout.toString().trim();
		} else {
			finalTreeSha = groupCommits[groupCommits.length - 1]?.tree_sha ?? "";
		}

		return {
			run_id: runId,
			source_copy_branch: copyBranch,
			group_commits: groupCommits,
			final_tree_sha: finalTreeSha,
			verified: false,
		};
	} catch (error) {
		for (const ref of createdRefs) {
			await Bun.$`git -C ${repo_path} update-ref -d ${ref}`.quiet().nothrow();
		}
		throw error;
	} finally {
		for (const idxFile of tmpIndexFiles) {
			await Bun.$`rm -f ${idxFile}`.quiet().nothrow();
		}
	}
}
