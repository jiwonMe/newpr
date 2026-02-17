import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { NewprOutput, FileChange } from "../../types/output.ts";
import { parseNarrativeAnchors, buildWalkthrough } from "../narrative-parser.ts";
import { T, STATUS_STYLE, TYPE_STYLE } from "../theme.ts";

function FileRow({ file }: { file: FileChange }) {
	const s = STATUS_STYLE[file.status] ?? { icon: "?", color: T.muted };
	return (
		<Box flexDirection="column" marginLeft={2}>
			<Box gap={1}>
				<Text color={s.color} bold>{s.icon}</Text>
				<Text color={T.text}>{file.path}</Text>
				<Text color={T.added}>+{file.additions}</Text>
				<Text color={T.deleted}>-{file.deletions}</Text>
			</Box>
			<Text color={T.muted} wrap="wrap">    {file.summary}</Text>
		</Box>
	);
}

export function WalkthroughPanel({
	data,
	isFocused,
	viewportHeight,
}: { data: NewprOutput; isFocused: boolean; viewportHeight: number }) {
	const parsed = useMemo(() => parseNarrativeAnchors(data.narrative), [data.narrative]);
	const steps = useMemo(
		() => buildWalkthrough(parsed, data.groups, data.files),
		[parsed, data.groups, data.files],
	);

	const [currentStep, setCurrentStep] = useState(0);
	const [scrollOffset, setScrollOffset] = useState(0);

	const step = steps[currentStep];

	useInput(
		(input, key) => {
			if (key.rightArrow || input === "l" || input === "n") {
				setCurrentStep((s) => Math.min(steps.length - 1, s + 1));
				setScrollOffset(0);
			} else if (key.leftArrow || input === "h" || input === "p") {
				setCurrentStep((s) => Math.max(0, s - 1));
				setScrollOffset(0);
			} else if (key.downArrow || input === "j") {
				setScrollOffset((s) => s + 1);
			} else if (key.upArrow || input === "k") {
				setScrollOffset((s) => Math.max(0, s - 1));
			}
		},
		{ isActive: isFocused },
	);

	if (!step || steps.length === 0) {
		return (
			<Box paddingX={2} paddingY={1}>
				<Text dimColor>No walkthrough steps available.</Text>
			</Box>
		);
	}

	const progressPct = steps.length > 1
		? Math.round((currentStep / (steps.length - 1)) * 100)
		: 100;

	const progressBarWidth = 20;
	const filled = Math.round((progressPct / 100) * progressBarWidth);
	const progressBar = "█".repeat(filled) + "░".repeat(progressBarWidth - filled);

	const contentLines: React.ReactNode[] = [];

	contentLines.push(
		<Box key="narrative-header" gap={1} marginBottom={1}>
			<Text bold color={T.primaryBold}>Narrative</Text>
		</Box>,
	);

	for (let li = 0; li < step.block.lines.length; li++) {
		const line = step.block.lines[li]!;
		contentLines.push(
			<Box key={`line-${li}`} paddingX={1}>
				<Text color={T.text} wrap="wrap">{line}</Text>
			</Box>,
		);
	}

	if (step.relatedGroups.length > 0) {
		contentLines.push(
			<Box key="groups-header" gap={1} marginTop={1}>
				<Text bold color={T.primary}>Groups</Text>
			</Box>,
		);

		for (const g of step.relatedGroups) {
			const typeColor = TYPE_STYLE[g.type]?.color ?? T.muted;
			contentLines.push(
				<Box key={`g-${g.name}`} gap={1} marginLeft={1}>
					<Text color={typeColor} bold>{g.name}</Text>
					<Text color={T.muted}>({g.type})</Text>
					<Text color={T.muted}>— {g.description}</Text>
				</Box>,
			);
		}
	}

	if (step.relatedFiles.length > 0) {
		contentLines.push(
			<Box key="files-header" gap={1} marginTop={1}>
				<Text bold color={T.accent}>Files ({step.relatedFiles.length})</Text>
			</Box>,
		);

		for (const f of step.relatedFiles) {
			contentLines.push(<FileRow key={`f-${f.path}`} file={f} />);
		}
	}

	const visibleHeight = Math.max(1, viewportHeight - 5);
	const visible = contentLines.slice(scrollOffset, scrollOffset + visibleHeight);
	const canScrollDown = scrollOffset + visibleHeight < contentLines.length;

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box gap={1} marginBottom={1}>
				<Text bold color={T.primary}>Walkthrough</Text>
				<Text color={T.faint}>│</Text>
				<Text color={T.muted}>Step {currentStep + 1}/{steps.length}</Text>
				<Text color={T.faint}>│</Text>
				<Text color={T.primary}>{progressBar}</Text>
				<Text color={T.muted}>{progressPct}%</Text>
			</Box>

			{visible}

			<Box marginTop={1} gap={1}>
				{scrollOffset > 0 && <Text color={T.faint}>↑</Text>}
				{canScrollDown && <Text color={T.faint}>↓</Text>}
				<Text color={T.faint}>│</Text>
				<Text color={T.primaryBold} bold>←/h</Text>
				<Text color={T.muted}>prev</Text>
				<Text color={T.primaryBold} bold>→/l</Text>
				<Text color={T.muted}>next</Text>
				<Text color={T.primaryBold} bold>j/k</Text>
				<Text color={T.muted}>scroll</Text>
			</Box>
		</Box>
	);
}
