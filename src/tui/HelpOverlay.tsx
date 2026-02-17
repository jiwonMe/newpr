import { Box, Text, useInput } from "ink";
import { T } from "./theme.ts";

const BINDINGS = [
	["Tab / 1-6", "Switch panels"],
	["↑ / k", "Move up / scroll up"],
	["↓ / j", "Move down / scroll down"],
	["] / [", "Next / prev anchor (Story)"],
	["Enter", "Pin anchor / expand group"],
	["← → / h l", "Prev / next step (Walk)"],
	["/", "Filter files (Files panel)"],
	["Esc", "Clear filter / close / back"],
	["q", "Quit / go back"],
	["?", "Toggle this help"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
	useInput((input, key) => {
		if (input === "?" || key.escape || input === "q") {
			onClose();
		}
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={T.primary}
			paddingX={2}
			paddingY={1}
		>
			<Text bold color={T.primary}> Keyboard Shortcuts </Text>
			<Text> </Text>
			{BINDINGS.map(([key, desc]) => (
				<Box key={key} gap={1}>
					<Box width={16}>
						<Text bold color={T.primaryBold}>{key}</Text>
					</Box>
					<Text color={T.muted}>{desc}</Text>
				</Box>
			))}
			<Text> </Text>
			<Text dimColor>Press <Text color={T.primaryBold}>?</Text> or <Text color={T.primaryBold}>Esc</Text> to close</Text>
		</Box>
	);
}
