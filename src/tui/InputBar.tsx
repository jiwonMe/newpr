import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { T } from "./theme.ts";

export function InputBar({
	placeholder,
	onSubmit,
	initialValue,
}: {
	placeholder: string;
	onSubmit: (value: string) => void;
	initialValue?: string;
}) {
	const [value, setValue] = useState(initialValue ?? "");
	const [focused, setFocused] = useState(true);

	useEffect(() => {
		if (initialValue) setValue(initialValue);
	}, [initialValue]);

	useInput(
		(input, key) => {
			if (key.return) {
				if (value.trim()) {
					onSubmit(value.trim());
					setFocused(false);
				}
				return;
			}
			if (key.backspace || key.delete) {
				setValue((v) => v.slice(0, -1));
				return;
			}
			if (key.ctrl && input === "u") {
				setValue("");
				return;
			}
			if (input && !key.ctrl && !key.meta && !key.escape) {
				setValue((v) => v + input);
			}
		},
		{ isActive: focused },
	);

	return (
		<Box paddingX={2}>
			<Text color={T.primary} bold>{"❯ "}</Text>
			{value ? (
				<Text color={T.text}>{value}<Text color={T.primary}>█</Text></Text>
			) : (
				<Text color={T.faint}>{placeholder}<Text color={T.primary}>█</Text></Text>
			)}
		</Box>
	);
}
