import type {
	DeltaEntry,
	ConstraintEdge,
	CycleReport,
	FeasibilityResult,
} from "./types.ts";

interface FeasibilityInput {
	deltas: DeltaEntry[];
	ownership: Map<string, string>;
	declared_deps?: Map<string, string[]>;
}

export function checkFeasibility(input: FeasibilityInput): FeasibilityResult {
	const { deltas, ownership, declared_deps } = input;

	const allGroups = new Set<string>(ownership.values());
	if (allGroups.size <= 1) {
		return {
			feasible: true,
			ordered_group_ids: Array.from(allGroups),
		};
	}

	const edges: ConstraintEdge[] = [];

	addPathOrderEdges(deltas, ownership, edges);
	if (declared_deps) {
		addDeclaredDepEdges(declared_deps, allGroups, edges);
	}

	const deduped = deduplicateEdges(edges);
	const result = topologicalSort(Array.from(allGroups), deduped, deltas, ownership);

	return result;
}

function addPathOrderEdges(
	deltas: DeltaEntry[],
	ownership: Map<string, string>,
	edges: ConstraintEdge[],
): void {
	const pathEditSequences = new Map<string, Array<{ commit_index: number; group_id: string; sha: string }>>();

	for (let commitIdx = 0; commitIdx < deltas.length; commitIdx++) {
		const delta = deltas[commitIdx];
		if (!delta) continue;

		for (const change of delta.changes) {
			const path = change.path;
			const groupId = ownership.get(path);
			if (!groupId) continue;

			let seq = pathEditSequences.get(path);
			if (!seq) {
				seq = [];
				pathEditSequences.set(path, seq);
			}
			seq.push({ commit_index: commitIdx, group_id: groupId, sha: delta.sha });
		}
	}

	for (const [path, seq] of pathEditSequences) {
		const collapsed = collapseConsecutiveDuplicates(seq);

		for (let i = 0; i < collapsed.length - 1; i++) {
			const prev = collapsed[i];
			const next = collapsed[i + 1];
			if (!prev || !next) continue;
			if (prev.group_id === next.group_id) continue;

			edges.push({
				from: prev.group_id,
				to: next.group_id,
				kind: "path-order",
				evidence: {
					path,
					from_commit: prev.sha,
					to_commit: next.sha,
					from_commit_index: prev.commit_index,
					to_commit_index: next.commit_index,
				},
			});
		}
	}
}

function collapseConsecutiveDuplicates<T extends { group_id: string }>(
	seq: T[],
): T[] {
	const result: T[] = [];
	for (const item of seq) {
		const last = result[result.length - 1];
		if (!last || last.group_id !== item.group_id) {
			result.push(item);
		}
	}
	return result;
}

function addDeclaredDepEdges(
	declaredDeps: Map<string, string[]>,
	allGroups: Set<string>,
	edges: ConstraintEdge[],
): void {
	for (const [groupId, deps] of declaredDeps) {
		if (!allGroups.has(groupId)) continue;

		for (const depGroupId of deps) {
			if (!allGroups.has(depGroupId)) continue;
			if (groupId === depGroupId) continue;

			edges.push({
				from: depGroupId,
				to: groupId,
				kind: "dependency",
			});
		}
	}
}

function deduplicateEdges(edges: ConstraintEdge[]): ConstraintEdge[] {
	const seen = new Set<string>();
	const result: ConstraintEdge[] = [];

	for (const edge of edges) {
		const key = `${edge.from}→${edge.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(edge);
	}

	return result;
}

function topologicalSort(
	groups: string[],
	edges: ConstraintEdge[],
	deltas: DeltaEntry[],
	ownership?: Map<string, string>,
): FeasibilityResult {
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();
	const edgeMap = new Map<string, ConstraintEdge>();

	for (const g of groups) {
		inDegree.set(g, 0);
		adjacency.set(g, []);
	}

	for (const edge of edges) {
		const neighbors = adjacency.get(edge.from);
		if (neighbors) {
			neighbors.push(edge.to);
		}
		inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
		edgeMap.set(`${edge.from}→${edge.to}`, edge);
	}

	const firstCommitDate = buildFirstCommitDateMap(groups, deltas, ownership);

	const queue: string[] = [];
	for (const [g, deg] of inDegree) {
		if (deg === 0) queue.push(g);
	}
	queue.sort((a, b) => tieBreaker(a, b, firstCommitDate));

	const sorted: string[] = [];

	while (queue.length > 0) {
		queue.sort((a, b) => tieBreaker(a, b, firstCommitDate));
		const node = queue.shift()!;
		sorted.push(node);

		const neighbors = adjacency.get(node) ?? [];
		for (const neighbor of neighbors) {
			const deg = (inDegree.get(neighbor) ?? 1) - 1;
			inDegree.set(neighbor, deg);
			if (deg === 0) {
				queue.push(neighbor);
			}
		}
	}

	if (sorted.length === groups.length) {
		return {
			feasible: true,
			ordered_group_ids: sorted,
		};
	}

	const cycle = findMinimalCycle(groups, adjacency, sorted, edgeMap);

	return {
		feasible: false,
		ordered_group_ids: undefined,
		cycle,
	};
}

function buildFirstCommitDateMap(
	groups: string[],
	deltas: DeltaEntry[],
	ownership?: Map<string, string>,
): Map<string, string> {
	const result = new Map<string, string>();
	for (const g of groups) {
		result.set(g, "9999");
	}
	for (const delta of deltas) {
		for (const change of delta.changes) {
			const groupId = ownership?.get(change.path);
			if (!groupId) continue;
			const current = result.get(groupId);
			if (current && delta.date < current) {
				result.set(groupId, delta.date);
			}
		}
	}
	return result;
}

function tieBreaker(
	a: string,
	b: string,
	firstCommitDate: Map<string, string>,
): number {
	const dateA = firstCommitDate.get(a) ?? "9999";
	const dateB = firstCommitDate.get(b) ?? "9999";
	if (dateA !== dateB) return dateA < dateB ? -1 : 1;
	return a.localeCompare(b);
}

function findMinimalCycle(
	allGroups: string[],
	adjacency: Map<string, string[]>,
	sorted: string[],
	edgeMap: Map<string, ConstraintEdge>,
): CycleReport {
	const inCycle = new Set(allGroups.filter((g) => !sorted.includes(g)));

	if (inCycle.size === 0) {
		return { group_cycle: [], edge_cycle: [] };
	}

	const start = Array.from(inCycle)[0]!;
	const visited = new Map<string, string>();
	const bfsQueue: string[] = [start];
	visited.set(start, "");

	while (bfsQueue.length > 0) {
		const current = bfsQueue.shift()!;
		const neighbors = adjacency.get(current) ?? [];

		for (const neighbor of neighbors) {
			if (!inCycle.has(neighbor)) continue;

			if (neighbor === start && visited.size > 1) {
				const cycle: string[] = [start];
				let backtrack = current;
				while (backtrack !== start && backtrack !== "") {
					cycle.unshift(backtrack);
					backtrack = visited.get(backtrack) ?? "";
				}
				cycle.push(start);

				const edgeCycle: ConstraintEdge[] = [];
				for (let i = 0; i < cycle.length - 1; i++) {
					const edge = edgeMap.get(`${cycle[i]}→${cycle[i + 1]}`);
					if (edge) edgeCycle.push(edge);
				}

				return { group_cycle: cycle, edge_cycle: edgeCycle };
			}

			if (!visited.has(neighbor)) {
				visited.set(neighbor, current);
				bfsQueue.push(neighbor);
			}
		}
	}

	return {
		group_cycle: Array.from(inCycle),
		edge_cycle: [],
	};
}
