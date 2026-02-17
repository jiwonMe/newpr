import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { T } from "./theme.ts";

export function InputBar({
	placeholder,
	onSubmit,
	onChange,
	initialValue,
}: {
	placeholder: string;
	onSubmit: (value: string) => void;
	onChange?: (value: string) => void;
	initialValue?: string;
}) {
	const [value, setValue] = useState(initialValue ?? "");
	const [focused] = useState(true);

	useEffect(() => {
		if (initialValue !== undefined) setValue(initialValue);
	}, [initialValue]);

	useEffect(() => {
		onChange?.(value);
	}, [value]);

	useInput(
		(input, key) => {
			if (key.return) {
				if (value.trim()) {
					onSubmit(value.trim());
					setValue("");
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
			if (key.escape) {
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
