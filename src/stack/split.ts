import type { LlmClient } from "../llm/client.ts";
import type { FileGroup, GroupType } from "../types/output.ts";
import type { StackWarning } from "./types.ts";

export interface SplitResult {
	groups: FileGroup[];
	ownership: Map<string, string>;
	warnings: StackWarning[];
}

interface SplitCandidate {
	group: FileGroup;
	files: string[];
}

const SPLIT_THRESHOLD = 8;

function findSplitCandidates(
	groups: FileGroup[],
	ownership: Map<string, string>,
): SplitCandidate[] {
	const groupFiles = new Map<string, string[]>();
	for (const [path, groupId] of ownership) {
		const files = groupFiles.get(groupId) ?? [];
		files.push(path);
		groupFiles.set(groupId, files);
	}

	const candidates: SplitCandidate[] = [];
	for (const group of groups) {
		const files = groupFiles.get(group.name) ?? [];
		if (files.length > SPLIT_THRESHOLD) {
			candidates.push({ group, files });
		}
	}

	return candidates;
}

export async function splitOversizedGroups(
	llmClient: LlmClient,
	groups: FileGroup[],
	ownership: Map<string, string>,
): Promise<SplitResult> {
	const candidates = findSplitCandidates(groups, ownership);

	if (candidates.length === 0) {
		return { groups, ownership, warnings: [] };
	}

	const newGroups: FileGroup[] = [];
	const newOwnership = new Map(ownership);
	const warnings: StackWarning[] = [];

	const unsplitGroupNames = new Set(groups.map((g) => g.name));
	for (const c of candidates) {
		unsplitGroupNames.delete(c.group.name);
	}

	for (const group of groups) {
		if (unsplitGroupNames.has(group.name)) {
			newGroups.push(group);
		}
	}

	for (const candidate of candidates) {
		const suggestedCount = Math.min(
			Math.ceil(candidate.files.length / SPLIT_THRESHOLD),
			4,
		);

		const system = `You split a large code change group into smaller, cohesive sub-groups for stacked PRs.

Rules:
1. Split into ${suggestedCount}-${suggestedCount + 1} sub-groups (aim for ${SPLIT_THRESHOLD} files or fewer each)
2. Each sub-group must be a cohesive unit of change that can stand alone as a PR
3. Group by logical purpose: shared utilities, specific feature area, tests, config, etc.
4. Sub-group names must be concise (2-4 words), distinct from each other
5. Every file from the input must appear in exactly one sub-group
6. type must be one of: feature, refactor, bugfix, chore, docs, test, config

Response format (JSON only, no markdown):
[
  {
    "name": "sub-group name",
    "type": "feature",
    "description": "what this sub-group does",
    "files": ["path/to/file1.ts", "path/to/file2.ts"]
  }
]`;

		const user = `Original group: "${candidate.group.name}" (${candidate.group.type})
Description: ${candidate.group.description}

Files (${candidate.files.length}):
${candidate.files.map((f) => `- ${f}`).join("\n")}

Split this into ${suggestedCount}-${suggestedCount + 1} smaller, cohesive sub-groups.`;

		try {
			const response = await llmClient.complete(system, user);
			const cleaned = response.content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
			const parsed = JSON.parse(cleaned) as Array<{
				name: string;
				type: string;
				description: string;
				files: string[];
			}>;

			if (!Array.isArray(parsed) || parsed.length < 2) {
				newGroups.push(candidate.group);
				continue;
			}

			const validTypes = new Set(["feature", "refactor", "bugfix", "chore", "docs", "test", "config"]);
			const candidateFileSet = new Set(candidate.files);
			const assignedFiles = new Set<string>();
			const subGroups: FileGroup[] = [];

			for (const sub of parsed) {
				if (!sub.name || !sub.files || sub.files.length === 0) continue;

				const validFiles = sub.files.filter((f) => candidateFileSet.has(f) && !assignedFiles.has(f));
				if (validFiles.length === 0) continue;

				for (const f of validFiles) assignedFiles.add(f);

				const subGroup: FileGroup = {
					name: sub.name,
					type: (validTypes.has(sub.type) ? sub.type : candidate.group.type) as GroupType,
					description: sub.description || candidate.group.description,
					files: validFiles,
				};
				subGroups.push(subGroup);
			}

			const unassigned = candidate.files.filter((f) => !assignedFiles.has(f));
			if (unassigned.length > 0 && subGroups.length > 0) {
				subGroups[subGroups.length - 1]!.files.push(...unassigned);
			}

			if (subGroups.length < 2) {
				newGroups.push(candidate.group);
				continue;
			}

			for (const sg of subGroups) {
				newGroups.push(sg);
				for (const f of sg.files) {
					newOwnership.set(f, sg.name);
				}
			}

			warnings.push({
				category: "grouping",
				severity: "info",
				title: `"${candidate.group.name}" split into ${subGroups.length} sub-groups`,
				message: `Group had ${candidate.files.length} files — split for smaller, more focused PRs`,
				details: subGroups.map((sg) => `"${sg.name}" (${sg.files.length} files)`),
			});
		} catch {
			newGroups.push(candidate.group);
			warnings.push({
				category: "system",
				severity: "warn",
				title: `Failed to split "${candidate.group.name}"`,
				message: "AI splitting failed — keeping original group intact",
			});
		}
	}

	return { groups: newGroups, ownership: newOwnership, warnings };
}
