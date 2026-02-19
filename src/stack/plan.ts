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
	dependency_edges?: Array<{ from: string; to: string }>;
}

export async function createStackPlan(input: PlanInput): Promise<StackPlan> {
	const { repo_path, base_sha, head_sha, deltas, ownership, group_order, groups, dependency_edges } = input;

	const groupRank = new Map<string, number>();
	group_order.forEach((gid, idx) => groupRank.set(gid, idx));

	const edges = dependency_edges ?? [];
	const dagParents = buildDagParents(group_order, edges);
	const explicitDagParents = buildExplicitDagParents(group_order, edges);
	const ancestorSets = buildAncestorSets(group_order, dagParents);

	const stackGroups = buildStackGroups(groups, group_order, ownership, dagParents, explicitDagParents);

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

				for (let idxNum = 0; idxNum < group_order.length; idxNum++) {
					const targetGroupId = group_order[idxNum]!;
					const isOwner = targetGroupId === fileGroupId;
					const isAncestorOfOwner = ancestorSets.get(targetGroupId)?.has(fileGroupId) ?? false;
					if (!isOwner && !isAncestorOfOwner) continue;

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

	const ancestorSetsRecord = new Map<string, string[]>();
	for (const [gid, set] of ancestorSets) {
		ancestorSetsRecord.set(gid, Array.from(set));
	}

	return {
		base_sha,
		head_sha,
		groups: stackGroups,
		expected_trees: expectedTrees,
		ancestor_sets: ancestorSetsRecord,
	};
}

export function buildDagParents(
	groupOrder: string[],
	dependencyEdges: Array<{ from: string; to: string }>,
): Map<string, string[]> {
	const explicit = buildExplicitDagParents(groupOrder, dependencyEdges);

	for (const gid of groupOrder) {
		if ((explicit.get(gid) ?? []).length === 0) {
			const rank = groupOrder.indexOf(gid);
			if (rank > 0) {
				const prev = groupOrder[rank - 1]!;
				if (!dependencyEdges.some((e) => e.to === gid)) {
					explicit.set(gid, [prev]);
				}
			}
		}
	}

	return explicit;
}

export function buildExplicitDagParents(
	groupOrder: string[],
	dependencyEdges: Array<{ from: string; to: string }>,
): Map<string, string[]> {
	const parents = new Map<string, string[]>();
	for (const gid of groupOrder) parents.set(gid, []);

	for (const edge of dependencyEdges) {
		if (!parents.has(edge.to)) continue;
		const arr = parents.get(edge.to)!;
		if (!arr.includes(edge.from)) arr.push(edge.from);
	}

	return parents;
}

export function buildAncestorSets(
	groupOrder: string[],
	dagParents: Map<string, string[]>,
): Map<string, Set<string>> {
	const ancestors = new Map<string, Set<string>>();

	for (const gid of groupOrder) {
		const set = new Set<string>();
		const queue = [...(dagParents.get(gid) ?? [])];
		while (queue.length > 0) {
			const node = queue.shift()!;
			if (set.has(node)) continue;
			set.add(node);
			for (const p of dagParents.get(node) ?? []) queue.push(p);
		}
		ancestors.set(gid, set);
	}

	return ancestors;
}

function buildStackGroups(
	groups: FileGroup[],
	groupOrder: string[],
	ownership: Map<string, string>,
	dagParents: Map<string, string[]>,
	explicitDagParents: Map<string, string[]>,
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
			deps: dagParents.get(gid) ?? [],
			explicit_deps: explicitDagParents.get(gid) ?? [],
			order: idx,
		};
	});
}
