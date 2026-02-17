import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { FileChange } from "../../types/output.ts";
import { T, STATUS_STYLE } from "../theme.ts";

export function FilesPanel({
	files,
	isFocused,
	viewportHeight,
}: { files: FileChange[]; isFocused: boolean; viewportHeight: number }) {
	const [selected, setSelected] = useState(0);
	const [scrollOffset, setScrollOffset] = useState(0);
	const [filterMode, setFilterMode] = useState(false);
	const [filterText, setFilterText] = useState("");

	const filtered = useMemo(() => {
		if (!filterText) return files;
		const lower = filterText.toLowerCase();
		return files.filter(
			(f) => f.path.toLowerCase().includes(lower) || f.summary.toLowerCase().includes(lower),
		);
	}, [files, filterText]);

	const linesPerFile = 2;
	const headerLines = (filterMode || filterText) ? 1 : 0;
	const maxVisible = Math.max(1, Math.floor((viewportHeight - 2 - headerLines) / linesPerFile));

	function ensureVisible(idx: number) {
		if (idx < scrollOffset) {
			setScrollOffset(idx);
		} else if (idx >= scrollOffset + maxVisible) {
			setScrollOffset(idx - maxVisible + 1);
		}
	}

	useInput(
		(input, key) => {
			if (filterMode) {
				if (key.escape || key.return) {
					setFilterMode(false);
					setSelected(0);
					setScrollOffset(0);
					return;
				}
				if (key.backspace || key.delete) {
					setFilterText((t) => t.slice(0, -1));
					return;
				}
				if (input && !key.ctrl && !key.meta) {
					setFilterText((t) => t + input);
					return;
				}
				return;
			}

			if (input === "/") {
				setFilterMode(true);
				setFilterText("");
				return;
			}
			if (key.escape) {
				setFilterText("");
				setSelected(0);
				setScrollOffset(0);
				return;
			}
			if (key.upArrow || input === "k") {
				setSelected((s) => {
					const next = Math.max(0, s - 1);
					ensureVisible(next);
					return next;
				});
			} else if (key.downArrow || input === "j") {
				setSelected((s) => {
					const next = Math.min(filtered.length - 1, s + 1);
					ensureVisible(next);
					return next;
				});
			}
		},
		{ isActive: isFocused },
	);

	const visible = filtered.slice(scrollOffset, scrollOffset + maxVisible);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset + maxVisible < filtered.length;

	return (
		<Box flexDirection="column" paddingX={1}>
			{filterMode && (
				<Box>
					<Text color={T.primary} bold>/ </Text>
					<Text color={T.text}>{filterText}</Text>
					<Text color={T.primary}>█</Text>
				</Box>
			)}
			{!filterMode && filterText && (
				<Text color={T.muted}>
					Filtered: <Text color={T.accent}>"{filterText}"</Text> ({filtered.length}/{files.length}) — <Text color={T.primaryBold}>Esc</Text> to clear
				</Text>
			)}

			{canScrollUp && <Text color={T.faint}> ↑ {scrollOffset} more above</Text>}

			{filtered.length === 0 && (
				<Text color={T.muted}>No files {filterText ? "matching filter" : "found"}.</Text>
			)}

			{visible.map((file, vi) => {
				const isSelected = scrollOffset + vi === selected;
				const ss = STATUS_STYLE[file.status] ?? { icon: "?", color: T.muted };
				return (
					<Box key={file.path} flexDirection="column">
						<Text inverse={isSelected && isFocused} bold={isSelected}>
							{" "}
							<Text color={isSelected && isFocused ? undefined : ss.color} bold>{ss.icon}</Text>
							{" "}
							<Text color={isSelected && isFocused ? undefined : T.text}>{file.path}</Text>
							{" "}
							<Text color={isSelected && isFocused ? undefined : T.added}>+{file.additions}</Text>
							<Text color={isSelected && isFocused ? undefined : T.deleted}>-{file.deletions}</Text>
						</Text>
						<Box paddingLeft={4}>
							<Text color={T.muted}>{file.summary}</Text>
							<Text color={T.faint}> [{file.groups.join(", ")}]</Text>
						</Box>
					</Box>
				);
			})}

			{canScrollDown && <Text color={T.faint}> ↓ {filtered.length - scrollOffset - maxVisible} more below</Text>}
		</Box>
	);
}
