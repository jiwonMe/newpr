import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { T } from "../theme.ts";

function renderMarkdownLine(line: string) {
	if (line.startsWith("### ")) {
		return <Text bold color={T.primaryBold}>{line.slice(4)}</Text>;
	}
	if (line.startsWith("## ")) {
		return <Text bold color={T.primary} underline>{line.slice(3)}</Text>;
	}
	if (line.startsWith("# ")) {
		return <Text bold color={T.primary} underline>{line.slice(2)}</Text>;
	}
	if (line.startsWith("- ") || line.startsWith("* ")) {
		return <Text><Text color={T.primary}>  •</Text> {line.slice(2)}</Text>;
	}
	if (line.trim() === "") {
		return <Text> </Text>;
	}

	const parts: React.JSX.Element[] = [];
	let remaining = line;
	let keyIdx = 0;

	while (remaining.length > 0) {
		const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
		const codeMatch = remaining.match(/`(.+?)`/);

		let firstMatch: { index: number; full: string; content: string; type: "bold" | "code" } | null = null;

		if (boldMatch?.index !== undefined) {
			firstMatch = { index: boldMatch.index, full: boldMatch[0], content: boldMatch[1]!, type: "bold" };
		}
		if (codeMatch?.index !== undefined) {
			if (!firstMatch || codeMatch.index < firstMatch.index) {
				firstMatch = { index: codeMatch.index, full: codeMatch[0], content: codeMatch[1]!, type: "code" };
			}
		}

		if (!firstMatch) {
			parts.push(<Text key={keyIdx++} color={T.text}>{remaining}</Text>);
			break;
		}

		if (firstMatch.index > 0) {
			parts.push(<Text key={keyIdx++} color={T.text}>{remaining.slice(0, firstMatch.index)}</Text>);
		}

		if (firstMatch.type === "bold") {
			parts.push(<Text key={keyIdx++} bold color={T.textBold}>{firstMatch.content}</Text>);
		} else {
			parts.push(<Text key={keyIdx++} color={T.accent}>{firstMatch.content}</Text>);
		}

		remaining = remaining.slice(firstMatch.index + firstMatch.full.length);
	}

	return <Text>{...parts}</Text>;
}

export function NarrativePanel({
	narrative,
	isFocused,
	viewportHeight,
}: { narrative: string; isFocused: boolean; viewportHeight: number }) {
	const lines = narrative.split("\n");
	const [scrollOffset, setScrollOffset] = useState(0);
	const maxScroll = Math.max(0, lines.length - viewportHeight + 3);

	useInput(
		(input, key) => {
			if (key.upArrow || input === "k") {
				setScrollOffset((s) => Math.max(0, s - 1));
			} else if (key.downArrow || input === "j") {
				setScrollOffset((s) => Math.min(maxScroll, s + 1));
			}
		},
		{ isActive: isFocused },
	);

	const visibleCount = Math.max(1, viewportHeight - 3);
	const visible = lines.slice(scrollOffset, scrollOffset + visibleCount);
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset < maxScroll;

	return (
		<Box flexDirection="column" paddingX={2}>
			<Box gap={1}>
				<Text bold color={T.primary}>¶ Change Narrative</Text>
				{(canScrollUp || canScrollDown) && (
					<Text color={T.faint}>({scrollOffset + 1}-{Math.min(scrollOffset + visibleCount, lines.length)}/{lines.length})</Text>
				)}
			</Box>
			{canScrollUp && <Text color={T.faint}>↑</Text>}
			{visible.map((line, i) => (
				<Box key={scrollOffset + i}>{renderMarkdownLine(line)}</Box>
			))}
			{canScrollDown && <Text color={T.faint}>↓</Text>}
		</Box>
	);
}
