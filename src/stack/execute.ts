import type {
	DeltaEntry,
	StackPlan,
	StackExecResult,
	GroupCommitInfo,
} from "./types.ts";

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
}

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function executeStack(input: ExecuteInput): Promise<StackExecResult> {
	const { repo_path, plan, deltas, ownership, pr_author, pr_number } = input;

	const runId = `newpr-stack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const tmpIndexFiles: string[] = [];
	const createdRefs: string[] = [];

	const groupOrder = plan.groups.map((g) => g.id);
	const groupRank = new Map<string, number>();
	groupOrder.forEach((gid, idx) => groupRank.set(gid, idx));

	try {
		for (let i = 0; i < groupOrder.length; i++) {
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

				// Suffix propagation: update index[fileRank] through index[N-1]
				for (let idxNum = fileRank; idxNum < groupOrder.length; idxNum++) {
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
		let prevCommitSha = plan.base_sha;

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
				throw new StackExecutionError(
					`Tree mismatch for group "${gid}": expected ${expectedTree}, got ${treeSha}`,
				);
			}

			const commitMessage = `${group.type}(${slugify(group.name)}): ${group.description}`;

			const commitTree = await Bun.$`git -C ${repo_path} commit-tree ${treeSha} -p ${prevCommitSha} -m ${commitMessage}`.env({
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

			const branchName = `newpr-stack/pr-${pr_number}/${group.order}-${slugify(group.name)}`;

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
			});

			prevCommitSha = commitSha;
		}

		const lastCommit = groupCommits[groupCommits.length - 1];
		const finalTreeSha = lastCommit?.tree_sha ?? "";

		return {
			run_id: runId,
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
