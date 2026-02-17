import React, { useState, useMemo, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { NewprOutput, FileGroup, FileChange } from "../../types/output.ts";
import {
	parseNarrativeAnchors,
	type NarrativeAnchor,
} from "../narrative-parser.ts";
import { T, STATUS_STYLE, TYPE_STYLE } from "../theme.ts";

interface DetailTarget {
	kind: "group" | "file";
	group?: FileGroup;
	files: FileChange[];
	file?: FileChange;
}

function resolveDetail(
	anchor: NarrativeAnchor,
	groups: FileGroup[],
	files: FileChange[],
): DetailTarget | null {
	if (anchor.kind === "group") {
		const group = groups.find((g) => g.name === anchor.id);
		if (!group) return null;
		const groupFiles = files.filter((f) => group.files.includes(f.path));
		return { kind: "group", group, files: groupFiles };
	}
	const file = files.find((f) => f.path === anchor.id);
	if (!file) return null;
	return { kind: "file", file, files: [file] };
}

function renderNarrativeLine(
	line: string,
	lineIndex: number,
	anchors: NarrativeAnchor[],
	activeAnchorIdx: number,
	allAnchors: NarrativeAnchor[],
): React.ReactNode {
	const lineAnchors = anchors.filter((a) => a.lineIndex === lineIndex);
	if (lineAnchors.length === 0) {
		return renderPlainLine(line);
	}

	const parts: React.ReactNode[] = [];
	let cursor = 0;
	let key = 0;

	for (const anchor of lineAnchors) {
		if (anchor.startCol > cursor) {
			parts.push(
				<Text key={key++} color={T.text}>
					{line.slice(cursor, anchor.startCol)}
				</Text>,
			);
		}

		const globalIdx = allAnchors.indexOf(anchor);
		const isActive = globalIdx === activeAnchorIdx;
		const label = line.slice(anchor.startCol, anchor.endCol);

		parts.push(
			<Text key={key++} inverse={isActive} bold={isActive} color={isActive ? T.textBold : T.primaryBold} underline={!isActive}>
				{label}
			</Text>,
		);

		cursor = anchor.endCol;
	}

	if (cursor < line.length) {
		parts.push(<Text key={key++} color={T.text}>{line.slice(cursor)}</Text>);
	}

	return <Text>{...parts}</Text>;
}

function renderPlainLine(line: string): React.ReactNode {
	if (line.startsWith("### ")) return <Text bold color={T.primaryBold}>{line.slice(4)}</Text>;
	if (line.startsWith("## ")) return <Text bold color={T.primary} underline>{line.slice(3)}</Text>;
	if (line.startsWith("# ")) return <Text bold color={T.primary} underline>{line.slice(2)}</Text>;
	if (line.startsWith("- ") || line.startsWith("* ")) {
		return <Text><Text color={T.primary}>  •</Text> {line.slice(2)}</Text>;
	}
	return <Text color={T.text}>{line}</Text>;
}

function DetailPane({
	target,
	detailScroll,
	height,
}: { target: DetailTarget | null; detailScroll: number; height: number }) {
	if (!target) {
		return (
			<Box flexDirection="column" paddingX={1} paddingY={1}>
				<Text color={T.faint} italic>Navigate to an anchor</Text>
				<Text color={T.faint} italic>to see details here</Text>
				<Text> </Text>
				<Text color={T.faint}>]/[ next/prev anchor</Text>
				<Text color={T.faint}>Enter to pin</Text>
			</Box>
		);
	}

	if (target.kind === "group" && target.group) {
		const g = target.group;
		const typeColor = TYPE_STYLE[g.type]?.color ?? T.muted;
		const lines: React.ReactNode[] = [
			<Box key="name" gap={1}>
				<Text bold color={typeColor}>{g.name}</Text>
				<Text color={T.muted}>({g.type})</Text>
			</Box>,
			<Text key="desc" color={T.muted} wrap="wrap">{g.description}</Text>,
			<Text key="sep" color={T.faint}>{"─".repeat(28)}</Text>,
		];

		for (const f of target.files) {
			const s = STATUS_STYLE[f.status] ?? { icon: "?", color: T.muted };
			lines.push(
				<Box key={`f-${f.path}`} flexDirection="column">
					<Box gap={1}>
						<Text color={s.color} bold>{s.icon}</Text>
						<Text color={T.text}>{f.path.split("/").pop()}</Text>
						<Text color={T.added}>+{f.additions}</Text>
						<Text color={T.deleted}>-{f.deletions}</Text>
					</Box>
					<Text color={T.muted} wrap="wrap">  {f.summary}</Text>
				</Box>,
			);
		}

		const visible = lines.slice(detailScroll, detailScroll + height - 1);
		return <Box flexDirection="column" paddingX={1}>{...visible}</Box>;
	}

	if (target.kind === "file" && target.file) {
		const f = target.file;
		const s = STATUS_STYLE[f.status] ?? { icon: "?", color: T.muted };
		return (
			<Box flexDirection="column" paddingX={1}>
				<Box gap={1}>
					<Text color={s.color} bold>{s.icon}</Text>
					<Text bold color={T.text}>{f.path}</Text>
				</Box>
				<Box gap={1}>
					<Text color={T.added}>+{f.additions}</Text>
					<Text color={T.deleted}>-{f.deletions}</Text>
					<Text color={T.faint}>[{f.groups.join(", ")}]</Text>
				</Box>
				<Text color={T.faint}>{"─".repeat(28)}</Text>
				<Text color={T.muted} wrap="wrap">{f.summary}</Text>
			</Box>
		);
	}

	return null;
}

export function StoryPanel({
	data,
	isFocused,
	viewportHeight,
}: { data: NewprOutput; isFocused: boolean; viewportHeight: number }) {
	const { stdout } = useStdout();
	const termWidth = stdout?.columns ?? 80;
	const leftWidth = Math.max(30, Math.floor(termWidth * 0.62));
	const rightWidth = Math.max(20, termWidth - leftWidth - 4);

	const parsed = useMemo(() => parseNarrativeAnchors(data.narrative), [data.narrative]);

	const [scrollOffset, setScrollOffset] = useState(0);
	const [activeAnchorIdx, setActiveAnchorIdx] = useState(0);
	const [pinned, setPinned] = useState(false);
	const [focusPane, setFocusPane] = useState<"narrative" | "detail">("narrative");
	const [detailScroll, setDetailScroll] = useState(0);

	const { displayLines, allAnchors } = parsed;
	const maxScroll = Math.max(0, displayLines.length - viewportHeight + 3);

	const currentAnchor = allAnchors[activeAnchorIdx] ?? null;
	const detailTarget = useMemo(
		() => currentAnchor ? resolveDetail(currentAnchor, data.groups, data.files) : null,
		[currentAnchor, data.groups, data.files],
	);

	const jumpToAnchor = useCallback((idx: number) => {
		const anchor = allAnchors[idx];
		if (!anchor) return;
		setActiveAnchorIdx(idx);
		setDetailScroll(0);
		if (anchor.lineIndex < scrollOffset || anchor.lineIndex >= scrollOffset + viewportHeight - 3) {
			setScrollOffset(Math.max(0, Math.min(anchor.lineIndex - 2, maxScroll)));
		}
	}, [allAnchors, scrollOffset, viewportHeight, maxScroll]);

	useInput(
		(input, key) => {
			if (key.tab) {
				setFocusPane((p) => p === "narrative" ? "detail" : "narrative");
				return;
			}

			if (focusPane === "narrative") {
				let explicitNav = false;

				if (key.upArrow || input === "k") {
					setScrollOffset((s) => Math.max(0, s - 1));
				} else if (key.downArrow || input === "j") {
					setScrollOffset((s) => Math.min(maxScroll, s + 1));
				} else if (input === "]") {
					explicitNav = true;
					const next = Math.min(allAnchors.length - 1, activeAnchorIdx + 1);
					jumpToAnchor(next);
				} else if (input === "[") {
					explicitNav = true;
					const prev = Math.max(0, activeAnchorIdx - 1);
					jumpToAnchor(prev);
				} else if (key.return) {
					setPinned((p) => !p);
				}

				if (!pinned && !explicitNav && !key.return && allAnchors.length > 0) {
					const visibleStart = scrollOffset;
					const visibleEnd = scrollOffset + viewportHeight - 3;
					const midLine = Math.floor((visibleStart + visibleEnd) / 2);
					const closest = allAnchors.reduce((best, a, i) => {
						const dist = Math.abs(a.lineIndex - midLine);
						const bestDist = best.idx === -1 ? Infinity : Math.abs(allAnchors[best.idx]!.lineIndex - midLine);
						return dist < bestDist ? { idx: i, dist } : best;
					}, { idx: -1, dist: Infinity });
					if (closest.idx >= 0 && closest.idx !== activeAnchorIdx) {
						setActiveAnchorIdx(closest.idx);
						setDetailScroll(0);
					}
				}
			} else {
				if (key.upArrow || input === "k") {
					setDetailScroll((s) => Math.max(0, s - 1));
				} else if (key.downArrow || input === "j") {
					setDetailScroll((s) => s + 1);
				} else if (key.escape) {
					setFocusPane("narrative");
				}
			}
		},
		{ isActive: isFocused },
	);

	const visibleCount = Math.max(1, viewportHeight - 3);
	const visible = displayLines.slice(scrollOffset, scrollOffset + visibleCount);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset < maxScroll;

	const anchorInfo = allAnchors.length > 0
		? `${activeAnchorIdx + 1}/${allAnchors.length}`
		: "no anchors";

	return (
		<Box flexDirection="column">
			<Box gap={1} paddingX={1}>
				<Text bold color={T.primary}>Story</Text>
				<Text color={T.faint}>│</Text>
				<Text color={T.muted}>
					Anchor {anchorInfo}
					{pinned ? <Text color={T.accent}> [pinned]</Text> : ""}
				</Text>
				<Text color={T.faint}>│</Text>
				<Text color={focusPane === "narrative" ? T.primary : T.muted} bold={focusPane === "narrative"}>
					Narrative
				</Text>
				<Text color={focusPane === "detail" ? T.primary : T.muted} bold={focusPane === "detail"}>
					Detail
				</Text>
			</Box>

			<Box>
				<Box flexDirection="column" width={leftWidth} borderStyle="single" borderColor={focusPane === "narrative" ? T.primary : T.border} borderRight borderLeft={false} borderTop={false} borderBottom={false}>
					{canScrollUp && <Text color={T.faint}> ↑</Text>}
					{visible.map((line, vi) => {
						const lineIdx = scrollOffset + vi;
						return (
							<Box key={lineIdx} paddingX={1}>
								{renderNarrativeLine(line, lineIdx, allAnchors, activeAnchorIdx, allAnchors)}
							</Box>
						);
					})}
					{canScrollDown && <Text color={T.faint}> ↓</Text>}
				</Box>

				<Box flexDirection="column" width={rightWidth}>
					<DetailPane target={detailTarget} detailScroll={detailScroll} height={viewportHeight - 2} />
				</Box>
			</Box>
		</Box>
	);
}
