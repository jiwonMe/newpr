import { Box, Text } from "ink";
import { T } from "./theme.ts";

function Key({ k }: { k: string }) {
	return <Text color={T.primaryBold} bold>{k}</Text>;
}

function Sep() {
	return <Text color={T.faint}>  │  </Text>;
}

export function Footer({ context }: { context?: string }) {
	return (
		<Box paddingX={1} borderStyle="single" borderColor={T.border} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
			<Key k="Tab/1-6" /><Text dimColor> panels</Text>
			<Sep />
			<Key k="↑↓/jk" /><Text dimColor> scroll</Text>
			<Sep />
			<Key k="]/[" /><Text dimColor> anchor</Text>
			<Sep />
			<Key k="Enter" /><Text dimColor> pin</Text>
			<Sep />
			<Key k="?" /><Text dimColor> help</Text>
			<Sep />
			<Key k="q" /><Text dimColor> quit</Text>
			{context && (
				<>
					<Sep />
					<Text color={T.accent}>{context}</Text>
				</>
			)}
		</Box>
	);
}
