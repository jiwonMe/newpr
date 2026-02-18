import type { StackWarning } from "./types.ts";

export interface ForcedMerge {
	path: string;
	from_group: string;
	to_group: string;
}

export interface CouplingResult {
	ownership: Map<string, string>;
	warnings: string[];
	structured_warnings: StackWarning[];
	forced_merges: ForcedMerge[];
}

/**
 * Hardcoded atomic coupling sets for v1.
 * Files in the same set MUST be in the same group.
 */
const COUPLING_SETS: Array<Set<string> | ((path: string) => boolean)> = [
	// Lockfiles + package.json
	new Set([
		"package.json",
		"bun.lockb",
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
	]),

	// .gitattributes (always earliest group)
	new Set([".gitattributes"]),

	// tsconfig family (glob pattern)
	(path: string) => path === "tsconfig.json" || /^tsconfig\..*\.json$/.test(path),
];

/**
 * Apply coupling rules to ownership map.
 *
 * When files in a coupling set span multiple groups:
 * - Move all to the earliest group (by groupOrder)
 * - Return warnings + forcedMerges
 *
 * @param ownership - Current path -> groupId mapping
 * @param changedFiles - All changed file paths
 * @param groupOrder - Ordered list of group IDs (earliest first)
 * @returns Modified ownership + warnings + forced merges
 */
export function applyCouplingRules(
	ownership: Map<string, string>,
	changedFiles: string[],
	groupOrder: string[],
): CouplingResult {
	const newOwnership = new Map(ownership);
	const warnings: string[] = [];
	const structuredWarnings: StackWarning[] = [];
	const forcedMerges: ForcedMerge[] = [];

	// Build group rank map for ordering
	const groupRank = new Map<string, number>();
	groupOrder.forEach((groupId, idx) => groupRank.set(groupId, idx));

	// Process each coupling set
	for (const couplingSet of COUPLING_SETS) {
		const matchedFiles: string[] = [];

		// Find all changed files in this coupling set
		for (const file of changedFiles) {
			const matches =
				couplingSet instanceof Set
					? couplingSet.has(file)
					: couplingSet(file);

			if (matches) {
				matchedFiles.push(file);
			}
		}

		if (matchedFiles.length === 0) continue;

		// Collect groups these files belong to
		const groups = new Set<string>();
		for (const file of matchedFiles) {
			const group = newOwnership.get(file);
			if (group) groups.add(group);
		}

		// If all in same group, no action needed
		if (groups.size <= 1) continue;

		// Find earliest group
		const sortedGroups = Array.from(groups).sort(
			(a, b) => (groupRank.get(a) ?? Infinity) - (groupRank.get(b) ?? Infinity),
		);
		const targetGroup = sortedGroups[0];
		if (!targetGroup) continue;

		// Move all files to earliest group
		for (const file of matchedFiles) {
			const currentGroup = newOwnership.get(file);
			if (currentGroup && currentGroup !== targetGroup) {
				newOwnership.set(file, targetGroup);
				forcedMerges.push({
					path: file,
					from_group: currentGroup,
					to_group: targetGroup,
				});
			} else if (!currentGroup) {
				// File not in ownership map, assign to target group
				newOwnership.set(file, targetGroup);
			}
		}

		// Add warning
		const fileList = matchedFiles.join(", ");
		const groupList = Array.from(groups).join(", ");
		warnings.push(
			`Coupling constraint: [${fileList}] were in groups [${groupList}], forced to earliest group "${targetGroup}"`,
		);
		structuredWarnings.push({
			category: "coupling",
			severity: "info",
			title: `${forcedMerges.length} file(s) moved to "${targetGroup}" by coupling rule`,
			message: `Files [${fileList}] must stay together — moved from [${groupList}] to earliest group`,
			details: matchedFiles,
		});
	}

	return {
		ownership: newOwnership,
		warnings,
		structured_warnings: structuredWarnings,
		forced_merges: forcedMerges,
	};
}
