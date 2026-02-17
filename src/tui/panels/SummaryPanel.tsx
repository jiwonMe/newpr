import { Box, Text } from "ink";
import type { PrSummary, PrMeta } from "../../types/output.ts";
import { T, RISK_COLORS } from "../theme.ts";

const RISK_ICONS: Record<string, string> = {
	low: "●",
	medium: "◐",
	high: "◉",
};

function Field({ label, value }: { label: string; value: string }) {
	return (
		<Box gap={1}>
			<Box width={10}>
				<Text bold color={T.primary}>{label}:</Text>
			</Box>
			<Text color={T.text} wrap="wrap">{value}</Text>
		</Box>
	);
}

export function SummaryPanel({ summary, meta }: { summary: PrSummary; meta: PrMeta }) {
	const riskColor = RISK_COLORS[summary.risk_level] ?? T.warn;
	const riskIcon = RISK_ICONS[summary.risk_level] ?? "●";

	return (
		<Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
			<Text bold color={T.primary}>◈ PR Summary</Text>

			<Box flexDirection="column">
				<Field label="Purpose" value={summary.purpose} />
				<Field label="Scope" value={summary.scope} />
				<Field label="Impact" value={summary.impact} />
				<Box gap={1}>
					<Box width={10}>
						<Text bold color={T.primary}>Risk:</Text>
					</Box>
					<Text color={riskColor} bold>{riskIcon} {summary.risk_level.toUpperCase()}</Text>
				</Box>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text bold color={T.faint}>─── Analysis Info ───</Text>
				<Box gap={1}>
					<Text color={T.muted}>Model:</Text>
					<Text color={T.text}>{meta.model_used}</Text>
				</Box>
				<Box gap={1}>
					<Text color={T.muted}>Time:</Text>
					<Text color={T.text}>{new Date(meta.analyzed_at).toLocaleString()}</Text>
				</Box>
				<Box gap={1}>
					<Text color={T.muted}>URL:</Text>
					<Text color={T.primary} underline>{meta.pr_url}</Text>
				</Box>
			</Box>
		</Box>
	);
}
