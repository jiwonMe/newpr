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
	group_order_hint?: string[];
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
	groupOrderHint?: string[],
): { system: string; user: string } {
	const summaryByPath = new Map(fileSummaries.map((f) => [f.path, f.summary]));

	const groupDescriptions = groups
		.map((g) => {
			const canonicalFiles = g.files.slice(0, 8);
			const fileHints = canonicalFiles.length > 0
				? `\n    Representative files: ${canonicalFiles.join(", ")}${g.files.length > 8 ? ` (+${g.files.length - 8} more)` : ""}`
				: "";
			return `- "${g.name}" (${g.type}): ${g.description}${fileHints}`;
		})
		.join("\n");

	const buildFileEntry = (path: string, extra = ""): string => {
		const summary = summaryByPath.get(path);
		const summaryNote = summary ? ` — ${summary}` : "";
		return `- ${path}${summaryNote}${extra}`;
	};

	const ambiguousSection = ambiguous.length > 0
		? `\n\nAmbiguous files (appear in multiple groups — pick the BEST ONE):\n${ambiguous
				.map((a) => buildFileEntry(a.path, ` → candidate groups: ${a.groups.join(", ")}`))
				.join("\n")}`
		: "";

	const unassignedSection = unassigned.length > 0
		? `\n\nUnassigned files (assign to the most relevant group — prefer an EXISTING group over creating Shared Foundation):\n${unassigned.map((f) => buildFileEntry(f)).join("\n")}`
		: "";

	const commitSection = commits.length > 0
		? `\n\nCommit history (use to understand intent of each change):\n${commits.map((c) => `- ${c.sha.substring(0, 7)} ${c.message}`).join("\n")}`
		: "";

	const orderHintSection = groupOrderHint && groupOrderHint.length > 1
		? `\n\nSuggested PR stack order (foundation → integration, for context only — use to judge which group a file logically "enables"):\n${groupOrderHint.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
		: "";

	return {
		system: `You are a senior engineer helping organize a pull request into a reviewable stack.

Your task: assign each ambiguous or unassigned file to EXACTLY ONE group.

Rules:
1. Assign every file to exactly one group — no file may be skipped.
2. Use file path structure, file summary, and commit messages to judge relevance.
3. An unassigned file that touches shared utilities (e.g. schema types, constants, index re-exports) belongs to the group that INTRODUCES or PRIMARILY USES those utilities in this PR.
4. Prefer existing groups. Only create a "Shared Foundation" group if a file is genuinely orthogonal to ALL existing groups AND is depended on by multiple groups.
5. Do NOT dump hard-to-classify files into Shared Foundation — that creates an oversized catch-all PR that defeats the purpose of stacking.
6. When in doubt, pick the group whose file paths are most similar (same directory prefix, same feature area).

Response format (JSON only):
{
  "assignments": [
    { "path": "file.ts", "group": "exact-group-name", "reason": "one sentence" }
  ],
  "shared_foundation": null
}

Only include shared_foundation if truly necessary:
{
  "assignments": [...],
  "shared_foundation": { "name": "Shared Foundation", "description": "why this is shared", "files": ["path1", "path2"] }
}`,
		user: `Groups:\n${groupDescriptions}${ambiguousSection}${unassignedSection}${commitSection}${orderHintSection}\n\nAssign every listed file to exactly one group. Prefer existing groups over Shared Foundation.`,
	};
}

export async function partitionGroups(
	client: LlmClient,
	groups: FileGroup[],
	changedFiles: string[],
	fileSummaries: FileSummaryInput[],
	commits: PrCommit[],
	groupOrderHint?: string[],
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
		groupOrderHint,
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
