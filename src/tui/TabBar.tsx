import { Box, Text } from "ink";
import { T } from "./theme.ts";

const TABS = [
	{ label: "Story", icon: "▶" },
	{ label: "Walk", icon: "⟫" },
	{ label: "Summary", icon: "◈" },
	{ label: "Groups", icon: "◆" },
	{ label: "Files", icon: "◇" },
	{ label: "Narrative", icon: "¶" },
];

export function TabBar({ activeIndex }: { activeIndex: number }) {
	return (
		<Box paddingX={1} gap={1}>
			{TABS.map((tab, i) => {
				const active = i === activeIndex;
				return (
					<Text
						key={tab.label}
						bold={active}
						inverse={active}
						color={active ? T.primary : T.muted}
					>
						{` ${tab.icon} ${i + 1}:${tab.label} `}
					</Text>
				);
			})}
		</Box>
	);
}
