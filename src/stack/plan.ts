import type {
	DeltaEntry,
	StackPlan,
	StackGroup,
} from "./types.ts";
import type { FileGroup, GroupType } from "../types/output.ts";

export interface PlanInput {
	repo_path: string;
	base_sha: string;
	head_sha: string;
	deltas: DeltaEntry[];
	ownership: Map<string, string>;
	group_order: string[];
	groups: FileGroup[];
}

export async function createStackPlan(input: PlanInput): Promise<StackPlan> {
	const { repo_path, base_sha, head_sha, deltas, ownership, group_order, groups } = input;

	const groupRank = new Map<string, number>();
	group_order.forEach((gid, idx) => groupRank.set(gid, idx));

	const stackGroups = buildStackGroups(groups, group_order, ownership);

	const tmpIndexFiles: string[] = [];
	const expectedTrees = new Map<string, string>();

	try {
		for (let i = 0; i < group_order.length; i++) {
			const idxFile = `/tmp/newpr-plan-idx-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
			tmpIndexFiles.push(idxFile);

			const readTree = await Bun.$`GIT_INDEX_FILE=${idxFile} git -C ${repo_path} read-tree ${base_sha}`.quiet().nothrow();
			if (readTree.exitCode !== 0) {
				throw new Error(`Failed to initialize index ${i}: ${readTree.stderr.toString().trim()}`);
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
				for (let idxNum = fileRank; idxNum < group_order.length; idxNum++) {
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
					throw new Error(`update-index failed for index ${idxNum}: ${updateIdx.stderr.toString().trim()}`);
				}
			}
		}

		for (let i = 0; i < group_order.length; i++) {
			const idxFile = tmpIndexFiles[i];
			const gid = group_order[i];
			if (!idxFile || !gid) continue;

			const writeTree = await Bun.$`GIT_INDEX_FILE=${idxFile} git -C ${repo_path} write-tree`.quiet().nothrow();
			if (writeTree.exitCode !== 0) {
				throw new Error(`write-tree failed for index ${i}: ${writeTree.stderr.toString().trim()}`);
			}

			expectedTrees.set(gid, writeTree.stdout.toString().trim());
		}
	} finally {
		for (const idxFile of tmpIndexFiles) {
			try {
				await Bun.$`rm -f ${idxFile}`.quiet().nothrow();
			} catch {}
		}
	}

	return {
		base_sha,
		head_sha,
		groups: stackGroups,
		expected_trees: expectedTrees,
	};
}

function buildStackGroups(
	groups: FileGroup[],
	groupOrder: string[],
	ownership: Map<string, string>,
): StackGroup[] {
	const groupNameMap = new Map<string, FileGroup>();
	for (const g of groups) {
		groupNameMap.set(g.name, g);
	}

	return groupOrder.map((gid, idx) => {
		const original = groupNameMap.get(gid);
		const files: string[] = [];

		for (const [path, owner] of ownership) {
			if (owner === gid) files.push(path);
		}

		return {
			id: gid,
			name: original?.name ?? gid,
			type: (original?.type ?? "chore") as GroupType,
			description: original?.description ?? "",
			files: files.sort(),
			deps: original?.dependencies ?? [],
			order: idx,
		};
	});
}
