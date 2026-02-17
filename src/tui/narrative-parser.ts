import type { FileGroup, FileChange } from "../types/output.ts";

export type AnchorKind = "group" | "file";

export interface NarrativeAnchor {
	kind: AnchorKind;
	id: string;
	lineIndex: number;
	startCol: number;
	endCol: number;
}

export interface NarrativeBlock {
	lines: string[];
	startLine: number;
	anchors: NarrativeAnchor[];
}

export interface ParsedNarrative {
	blocks: NarrativeBlock[];
	allAnchors: NarrativeAnchor[];
	displayLines: string[];
}

const ANCHOR_RE = /\[\[(group|file):(.+?)\]\]/g;

export function parseNarrativeAnchors(narrative: string): ParsedNarrative {
	const rawLines = narrative.split("\n");
	const displayLines: string[] = [];
	const allAnchors: NarrativeAnchor[] = [];

	for (let i = 0; i < rawLines.length; i++) {
		const raw = rawLines[i]!;
		let display = "";
		let lastIndex = 0;

		ANCHOR_RE.lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = ANCHOR_RE.exec(raw)) !== null) {
			display += raw.slice(lastIndex, match.index);
			const startCol = display.length;
			const kind = match[1] as AnchorKind;
			const id = match[2]!;
			const label = kind === "file" ? id.split("/").pop()! : id;
			display += label;

			allAnchors.push({
				kind,
				id,
				lineIndex: i,
				startCol,
				endCol: startCol + label.length,
			});

			lastIndex = match.index + match[0].length;
		}

		display += raw.slice(lastIndex);
		displayLines.push(display);
	}

	const blocks = buildBlocks(displayLines, allAnchors);
	return { blocks, allAnchors, displayLines };
}

function buildBlocks(lines: string[], anchors: NarrativeAnchor[]): NarrativeBlock[] {
	const blocks: NarrativeBlock[] = [];
	let current: NarrativeBlock | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const isEmpty = line.trim() === "";
		const isHeading = /^#{1,3}\s/.test(line);

		if ((isEmpty || isHeading) && current) {
			blocks.push(current);
			current = null;
		}

		if (isEmpty) continue;

		if (!current) {
			current = { lines: [], startLine: i, anchors: [] };
		}

		current.lines.push(line);
		const lineAnchors = anchors.filter((a) => a.lineIndex === i);
		current.anchors.push(...lineAnchors);
	}

	if (current) blocks.push(current);
	return blocks;
}

export interface WalkthroughStep {
	type: "narrative";
	blockIndex: number;
	block: NarrativeBlock;
	relatedGroups: FileGroup[];
	relatedFiles: FileChange[];
}

export function buildWalkthrough(
	parsed: ParsedNarrative,
	groups: FileGroup[],
	files: FileChange[],
): WalkthroughStep[] {
	const groupMap = new Map(groups.map((g) => [g.name, g]));
	const fileMap = new Map(files.map((f) => [f.path, f]));

	return parsed.blocks.map((block, i) => {
		const relatedGroups: FileGroup[] = [];
		const relatedFiles: FileChange[] = [];
		const seenGroups = new Set<string>();
		const seenFiles = new Set<string>();

		for (const anchor of block.anchors) {
			if (anchor.kind === "group") {
				const group = groupMap.get(anchor.id);
				if (group && !seenGroups.has(anchor.id)) {
					seenGroups.add(anchor.id);
					relatedGroups.push(group);
					for (const fp of group.files) {
						if (!seenFiles.has(fp)) {
							seenFiles.add(fp);
							const file = fileMap.get(fp);
							if (file) relatedFiles.push(file);
						}
					}
				}
			} else {
				if (!seenFiles.has(anchor.id)) {
					seenFiles.add(anchor.id);
					const file = fileMap.get(anchor.id);
					if (file) relatedFiles.push(file);
				}
			}
		}

		return { type: "narrative" as const, blockIndex: i, block, relatedGroups, relatedFiles };
	});
}
