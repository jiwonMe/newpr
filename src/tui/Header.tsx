import { Box, Text } from "ink";
import type { PrMeta } from "../types/output.ts";
import { T } from "./theme.ts";

export function Header({ meta }: { meta: PrMeta }) {
	return (
		<Box flexDirection="column" borderStyle="double" borderColor={T.primary} paddingX={1}>
			<Box gap={1}>
				<Text color={T.primary} bold>PR #{meta.pr_number}</Text>
				<Text bold color={T.textBold}>{meta.pr_title}</Text>
			</Box>
			<Box gap={0}>
				<Text color={T.muted}>{meta.author}</Text>
				<Text dimColor> │ </Text>
				<Text color={T.primary}>{meta.base_branch}</Text>
				<Text color={T.faint}> ← </Text>
				<Text color={T.primaryBold}>{meta.head_branch}</Text>
				<Text dimColor> │ </Text>
				<Text color={T.accent}>{meta.total_files_changed}</Text>
				<Text dimColor> files │ </Text>
				<Text color={T.added}>+{meta.total_additions}</Text>
				<Text dimColor> </Text>
				<Text color={T.deleted}>-{meta.total_deletions}</Text>
			</Box>
		</Box>
	);
}
