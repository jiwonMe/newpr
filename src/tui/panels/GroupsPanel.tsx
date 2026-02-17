import { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { FileGroup, FileChange } from "../../types/output.ts";
import { T, TYPE_STYLE, STATUS_STYLE } from "../theme.ts";

interface RenderedLine {
	key: string;
	node: React.ReactNode;
	groupIndex: number;
}

export function GroupsPanel({
	groups,
	files,
	isFocused,
	viewportHeight,
}: { groups: FileGroup[]; files: FileChange[]; isFocused: boolean; viewportHeight: number }) {
	const [selected, setSelected] = useState(0);
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const [scrollOffset, setScrollOffset] = useState(0);

	const toggle = useCallback(() => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(selected)) next.delete(selected);
			else next.add(selected);
			return next;
		});
	}, [selected]);

	const allLines = useMemo(() => {
		const lines: RenderedLine[] = [];
		for (let gi = 0; gi < groups.length; gi++) {
			const group = groups[gi]!;
			const isExpanded = expanded.has(gi);
			const style = TYPE_STYLE[group.type] ?? { icon: "•", color: T.muted };
			const arrow = isExpanded ? "▼" : "▶";
			const isSelected = gi === selected;

			lines.push({
				key: `g-${gi}`,
				groupIndex: gi,
				node: (
					<Text inverse={isSelected && isFocused} bold={isSelected}>
						{" "}<Text color={isSelected && isFocused ? undefined : T.faint}>{arrow}</Text>
						{" "}<Text color={isSelected && isFocused ? undefined : style.color}>{style.icon}</Text>
						{" "}{group.name}
						{" "}<Text color={isSelected && isFocused ? undefined : T.muted}>({group.files.length})</Text>
						{" "}<Text color={isSelected && isFocused ? undefined : T.faint} dimColor>{group.type}</Text>
					</Text>
				),
			});

			if (!isExpanded) {
				lines.push({
					key: `g-${gi}-desc`,
					groupIndex: gi,
					node: <Text color={T.muted}>     {group.description}</Text>,
				});
			} else {
				lines.push({
					key: `g-${gi}-desc-e`,
					groupIndex: gi,
					node: <Text color={T.muted} italic>     {group.description}</Text>,
				});
				const groupFiles = files.filter((f) => group.files.includes(f.path));
				for (const f of groupFiles) {
					const fs = STATUS_STYLE[f.status] ?? { icon: "?", color: T.muted };
					lines.push({
						key: `g-${gi}-f-${f.path}`,
						groupIndex: gi,
						node: (
							<Box gap={1} marginLeft={4}>
								<Text color={fs.color} bold>{fs.icon}</Text>
								<Text color={T.text}>{f.path}</Text>
								<Text color={T.added}>+{f.additions}</Text>
								<Text color={T.deleted}>-{f.deletions}</Text>
							</Box>
						),
					});
				}
			}
		}
		return lines;
	}, [groups, files, expanded, selected, isFocused]);

	useInput(
		(input, key) => {
			if (key.upArrow || input === "k") {
				setSelected((s) => {
					const next = Math.max(0, s - 1);
					ensureVisible(next);
					return next;
				});
			} else if (key.downArrow || input === "j") {
				setSelected((s) => {
					const next = Math.min(groups.length - 1, s + 1);
					ensureVisible(next);
					return next;
				});
			} else if (key.return) {
				toggle();
			}
		},
		{ isActive: isFocused },
	);

	function ensureVisible(groupIdx: number) {
		const firstLineIdx = allLines.findIndex((l) => l.groupIndex === groupIdx);
		if (firstLineIdx === -1) return;

		if (firstLineIdx < scrollOffset) {
			setScrollOffset(firstLineIdx);
		} else if (firstLineIdx >= scrollOffset + viewportHeight - 2) {
			setScrollOffset(Math.max(0, firstLineIdx - viewportHeight + 4));
		}
	}

	if (groups.length === 0) {
		return (
			<Box paddingX={2} paddingY={1}>
				<Text dimColor>No change groups found.</Text>
			</Box>
		);
	}

	const visible = allLines.slice(scrollOffset, scrollOffset + viewportHeight - 2);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset + viewportHeight - 2 < allLines.length;

	return (
		<Box flexDirection="column" paddingX={1}>
			{canScrollUp && <Text color={T.faint}> ↑ more above</Text>}
			{visible.map((line) => (
				<Box key={line.key}>{line.node}</Box>
			))}
			{canScrollDown && <Text color={T.faint}> ↓ more below</Text>}
		</Box>
	);
}
