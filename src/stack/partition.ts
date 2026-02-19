import type { FileGroup } from "../types/output.ts";
import type { PrCommit } from "../types/github.ts";
import type { LlmClient } from "../llm/client.ts";
import type { PartitionResult, ReattributedFile, StackWarning } from "./types.ts";
import { safeParseJson } from "./json-utils.ts";

interface FileSummaryInput {
	path: string;
	status: string;
	summary: string;
}

export interface PartitionInput {
	groups: FileGroup[];
	changed_files: string[];
}

export interface AmbiguityReport {
	exclusive: Map<string, string>;
	ambiguous: Array<{ path: string; groups: string[] }>;
	unassigned: string[];
}

export function detectAmbiguousPaths(input: PartitionInput): AmbiguityReport {
	const { groups, changed_files } = input;

	const pathToGroups = new Map<string, string[]>();

	for (const group of groups) {
		for (const file of group.files) {
			const existing = pathToGroups.get(file) ?? [];
			existing.push(group.name);
			pathToGroups.set(file, existing);
		}
	}

	const exclusive = new Map<string, string>();
	const ambiguous: Array<{ path: string; groups: string[] }> = [];
	const unassigned: string[] = [];

	for (const file of changed_files) {
		const groups = pathToGroups.get(file);
		if (!groups || groups.length === 0) {
			unassigned.push(file);
		} else if (groups.length === 1) {
			exclusive.set(file, groups[0]!);
		} else {
			ambiguous.push({ path: file, groups });
		}
	}

	return { exclusive, ambiguous, unassigned };
}

export function buildStackPartitionPrompt(
	ambiguous: Array<{ path: string; groups: string[] }>,
	unassigned: string[],
	groups: FileGroup[],
	fileSummaries: FileSummaryInput[],
	commits: PrCommit[],
): { system: string; user: string } {
	const groupDescriptions = groups
		.map((g) => `- "${g.name}" (${g.type}): ${g.description}`)
		.join("\n");

	const ambiguousSection = ambiguous.length > 0
		? `\n\nAmbiguous files (appear in multiple groups):\n${ambiguous
				.map((a) => `- ${a.path} → in groups: ${a.groups.join(", ")}`)
				.join("\n")}`
		: "";

	const unassignedSection = unassigned.length > 0
		? `\n\nUnassigned files (not in any group):\n${unassigned.map((f) => `- ${f}`).join("\n")}`
		: "";

	const fileSummarySection = fileSummaries.length > 0
		? `\n\nFile summaries:\n${fileSummaries.map((f) => `- ${f.path}: ${f.summary}`).join("\n")}`
		: "";

	const commitSection = commits.length > 0
		? `\n\nCommit history:\n${commits.map((c) => `- ${c.sha.substring(0, 7)} ${c.message}`).join("\n")}`
		: "";

	return {
		system: `You are a code organization expert. Your task is to assign each file to EXACTLY ONE group for PR stacking.

Rules:
1. Each file must be assigned to exactly one group
2. Do not change files that are already exclusively assigned
3. For ambiguous files, choose the group where the file's changes are most relevant
4. For unassigned files, assign them to the most appropriate existing group
5. You may create a "Shared Foundation" group ONLY if files truly don't fit any existing group
6. Respond ONLY with a JSON object

Response format:
{
  "assignments": [
    { "path": "file.ts", "group": "group-name", "reason": "brief reason" }
  ],
  "shared_foundation": null
}

If creating a Shared Foundation group:
{
  "assignments": [...],
  "shared_foundation": { "name": "Shared Foundation", "description": "Common infrastructure changes", "files": [...] }
}`,
		user: `Groups:\n${groupDescriptions}${ambiguousSection}${unassignedSection}${fileSummarySection}${commitSection}\n\nAssign each ambiguous/unassigned file to exactly one group.`,
	};
}

export async function partitionGroups(
	client: LlmClient,
	groups: FileGroup[],
	changedFiles: string[],
	fileSummaries: FileSummaryInput[],
	commits: PrCommit[],
): Promise<PartitionResult> {
	const report = detectAmbiguousPaths({ groups, changed_files: changedFiles });

	if (report.ambiguous.length === 0 && report.unassigned.length === 0) {
		return {
			ownership: report.exclusive,
			reattributed: [],
			warnings: [],
			structured_warnings: [],
		};
	}

	const prompt = buildStackPartitionPrompt(
		report.ambiguous,
		report.unassigned,
		groups,
		fileSummaries,
		commits,
	);

	const response = await client.complete(prompt.system, prompt.user);
	try {
		return parsePartitionResponse(response.content, report, groups);
	} catch {
		const ownership = new Map(report.exclusive);
		const fallbackGroup = groups[groups.length - 1]?.name;
		if (fallbackGroup) {
			for (const entry of report.ambiguous) {
				ownership.set(entry.path, fallbackGroup);
			}
			for (const path of report.unassigned) {
				ownership.set(path, fallbackGroup);
			}
		}

		const affected = [...report.ambiguous.map((a) => a.path), ...report.unassigned];
		return {
			ownership,
			reattributed: [],
			warnings: [
				`AI partition response could not be parsed; fallback assignment applied${fallbackGroup ? ` to "${fallbackGroup}"` : ""}`,
			],
			structured_warnings: [{
				category: "system",
				severity: "warn",
				title: "AI partition parse failed; fallback assignment applied",
				message: "Response contained non-JSON artifacts; ambiguous/unassigned files were auto-assigned",
				details: affected,
			}],
		};
	}
}

function parsePartitionResponse(
	raw: string,
	report: AmbiguityReport,
	groups: FileGroup[],
): PartitionResult {
	const result = safeParseJson(raw);
	if (!result.ok) throw new Error(`Partition parse failed: ${result.error}`);
	const parsed: unknown = result.data;

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Expected JSON object for partition response");
	}

	const data = parsed as Record<string, unknown>;
	const assignments = data.assignments;

	if (!Array.isArray(assignments)) {
		throw new Error("Expected 'assignments' array in partition response");
	}

	const ownership = new Map(report.exclusive);
	const reattributed: ReattributedFile[] = [];
	const warnings: string[] = [];
	const structuredWarnings: StackWarning[] = [];

	let sharedFoundation: FileGroup | undefined;
	if (data.shared_foundation && typeof data.shared_foundation === "object") {
		const sf = data.shared_foundation as Record<string, unknown>;
		sharedFoundation = {
			name: String(sf.name ?? "Shared Foundation"),
			type: "chore",
			description: String(sf.description ?? "Common infrastructure changes"),
			files: Array.isArray(sf.files) ? sf.files.map(String) : [],
		};
	}

	const groupNameLookup = new Map<string, string>();
	for (const group of groups) {
		groupNameLookup.set(group.name.toLowerCase(), group.name);
	}
	if (sharedFoundation) {
		groupNameLookup.set(sharedFoundation.name.toLowerCase(), sharedFoundation.name);
		groupNameLookup.set("shared foundation", sharedFoundation.name);
	}

	for (const item of assignments) {
		const entry = item as Record<string, unknown>;
		const path = String(entry.path ?? "");
		const group = String(entry.group ?? "");
		const reason = String(entry.reason ?? "");

		if (!path || !group) {
			warnings.push(`Invalid assignment entry: ${JSON.stringify(item)}`);
			continue;
		}

		const normalizedGroup = group.toLowerCase().replace(/["'`]/g, "").trim();
		const isSharedFoundationAlias = /shared[\s_-]*foundation/.test(normalizedGroup);
		let canonicalGroup = groupNameLookup.get(normalizedGroup);
		if (!canonicalGroup && isSharedFoundationAlias) {
			if (!sharedFoundation) {
				sharedFoundation = {
					name: "Shared Foundation",
					type: "chore",
					description: "Common infrastructure changes",
					files: [],
				};
			}
			groupNameLookup.set(sharedFoundation.name.toLowerCase(), sharedFoundation.name);
			groupNameLookup.set("shared-foundation", sharedFoundation.name);
			groupNameLookup.set("shared_foundation", sharedFoundation.name);
			groupNameLookup.set("shared foundation", sharedFoundation.name);
			canonicalGroup = sharedFoundation.name;
		}

		if (!canonicalGroup) {
			warnings.push(`Unknown group "${group}" for file "${path}", skipping`);
			structuredWarnings.push({
				category: "system",
				severity: "warn",
				title: "Invalid group in AI response",
				message: `"${path}" was assigned to unknown group "${group}" — skipped`,
			});
			continue;
		}

		const ambiguousEntry = report.ambiguous.find((a) => a.path === path);
		const isUnassigned = report.unassigned.includes(path);

		if (ambiguousEntry) {
			reattributed.push({
				path,
				from_groups: ambiguousEntry.groups,
				to_group: canonicalGroup,
				reason,
			});
		} else if (isUnassigned) {
			reattributed.push({
				path,
				from_groups: [],
				to_group: canonicalGroup,
				reason,
			});
		}

		ownership.set(path, canonicalGroup);
		if (sharedFoundation && canonicalGroup === sharedFoundation.name && !sharedFoundation.files.includes(path)) {
			sharedFoundation.files.push(path);
		}
	}

	const stillUnassigned = report.unassigned.filter((p) => !ownership.has(p));
	const stillAmbiguous = report.ambiguous.filter((a) => !ownership.has(a.path));

	const fallbackGroup = groups[groups.length - 1]?.name;

	if (stillUnassigned.length > 0 && fallbackGroup) {
		for (const path of stillUnassigned) {
			ownership.set(path, fallbackGroup);
			reattributed.push({ path, from_groups: [], to_group: fallbackGroup, reason: "LLM did not assign; fallback to last group" });
		}
		warnings.push(`Files force-assigned to "${fallbackGroup}" (LLM missed): ${stillUnassigned.join(", ")}`);
		structuredWarnings.push({
			category: "assignment",
			severity: "warn",
			title: `${stillUnassigned.length} file(s) auto-assigned to "${fallbackGroup}"`,
			message: "AI did not assign these files — they were placed in the last group as fallback",
			details: stillUnassigned,
		});
	}
	if (stillAmbiguous.length > 0 && fallbackGroup) {
		const paths = stillAmbiguous.map((a) => a.path);
		for (const a of stillAmbiguous) {
			ownership.set(a.path, fallbackGroup);
			reattributed.push({ path: a.path, from_groups: a.groups, to_group: fallbackGroup, reason: "LLM did not resolve ambiguity; fallback to last group" });
		}
		warnings.push(`Files force-assigned to "${fallbackGroup}" (LLM missed): ${paths.join(", ")}`);
		structuredWarnings.push({
			category: "assignment",
			severity: "warn",
			title: `${paths.length} ambiguous file(s) auto-assigned to "${fallbackGroup}"`,
			message: "AI did not resolve which group these files belong to — placed in last group",
			details: paths,
		});
	}

	return {
		ownership,
		reattributed,
		shared_foundation_group: sharedFoundation,
		warnings,
		structured_warnings: structuredWarnings,
	};
}
