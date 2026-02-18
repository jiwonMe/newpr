import type { FileGroup } from "../types/output.ts";

export interface MergeResult {
	groups: FileGroup[];
	ownership: Map<string, string>;
	merges: Array<{ absorbed: string; into: string }>;
}

export function mergeGroups(
	groups: FileGroup[],
	ownership: Map<string, string>,
	targetCount: number,
): MergeResult {
	if (targetCount <= 0 || groups.length <= targetCount) {
		return { groups: [...groups], ownership: new Map(ownership), merges: [] };
	}

	const working = groups.map((g) => ({ ...g, files: [...g.files] }));
	const newOwnership = new Map(ownership);
	const merges: Array<{ absorbed: string; into: string }> = [];

	while (working.length > targetCount) {
		let minSize = Infinity;
		let minIdx = -1;

		for (let i = 0; i < working.length; i++) {
			const size = working[i]!.files.length;
			if (size < minSize) {
				minSize = size;
				minIdx = i;
			}
		}

		if (minIdx === -1) break;

		const smallest = working[minIdx]!;

		let bestNeighborIdx = minIdx === 0 ? 1 : minIdx - 1;
		if (working.length > 2) {
			const left = minIdx > 0 ? minIdx - 1 : -1;
			const right = minIdx < working.length - 1 ? minIdx + 1 : -1;

			if (left >= 0 && right >= 0) {
				bestNeighborIdx = working[left]!.files.length <= working[right]!.files.length
					? left
					: right;
			} else if (left >= 0) {
				bestNeighborIdx = left;
			} else {
				bestNeighborIdx = right;
			}
		}

		const neighbor = working[bestNeighborIdx]!;

		const absorbed = smallest.files.length <= neighbor.files.length ? smallest : neighbor;
		const survivor = absorbed === smallest ? neighbor : smallest;

		for (const file of absorbed.files) {
			if (!survivor.files.includes(file)) {
				survivor.files.push(file);
			}
		}

		if (absorbed.key_changes) {
			survivor.key_changes = [
				...(survivor.key_changes ?? []),
				...absorbed.key_changes,
			];
		}

		for (const [path, groupId] of newOwnership) {
			if (groupId === absorbed.name) {
				newOwnership.set(path, survivor.name);
			}
		}

		merges.push({ absorbed: absorbed.name, into: survivor.name });

		const removeIdx = working.indexOf(absorbed);
		if (removeIdx >= 0) {
			working.splice(removeIdx, 1);
		}
	}

	return { groups: working, ownership: newOwnership, merges };
}
