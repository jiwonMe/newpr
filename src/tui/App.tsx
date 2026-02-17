import { useState, useCallback } from "react";
import { Box, useInput, useApp, useStdout } from "ink";
import type { NewprOutput } from "../types/output.ts";
import { Header } from "./Header.tsx";
import { TabBar } from "./TabBar.tsx";
import { Footer } from "./Footer.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { StoryPanel } from "./panels/StoryPanel.tsx";
import { WalkthroughPanel } from "./panels/WalkthroughPanel.tsx";
import { SummaryPanel } from "./panels/SummaryPanel.tsx";
import { GroupsPanel } from "./panels/GroupsPanel.tsx";
import { FilesPanel } from "./panels/FilesPanel.tsx";
import { NarrativePanel } from "./panels/NarrativePanel.tsx";

const TAB_COUNT = 6;

export function App({ data, onBack }: { data: NewprOutput; onBack?: () => void }) {
	const { exit } = useApp();
	const [activeTab, setActiveTab] = useState(0);
	const [showHelp, setShowHelp] = useState(false);

	const switchTab = useCallback(
		(dir: number) => setActiveTab((t) => (t + dir + TAB_COUNT) % TAB_COUNT),
		[],
	);

	useInput(
		(input, key) => {
			if (input === "q") {
				if (onBack) {
					onBack();
				} else {
					exit();
				}
				return;
			}
			if (key.escape && onBack) {
				onBack();
				return;
			}
			if (input === "?") {
				setShowHelp((s) => !s);
				return;
			}
			if (key.tab) {
				switchTab(key.shift ? -1 : 1);
				return;
			}
			if (input === "1") setActiveTab(0);
			else if (input === "2") setActiveTab(1);
			else if (input === "3") setActiveTab(2);
			else if (input === "4") setActiveTab(3);
			else if (input === "5") setActiveTab(4);
			else if (input === "6") setActiveTab(5);
		},
		{ isActive: !showHelp },
	);

	if (showHelp) {
		return (
			<Box flexDirection="column">
				<Header meta={data.meta} />
				<HelpOverlay onClose={() => setShowHelp(false)} />
			</Box>
		);
	}

	const { stdout } = useStdout();
	const termHeight = stdout?.rows ?? 24;
	const panelHeight = Math.max(5, Math.floor(termHeight * 0.8) - 7);

	return (
		<Box flexDirection="column">
			<Header meta={data.meta} />
			<TabBar activeIndex={activeTab} />

			<Box flexDirection="column" height={panelHeight} overflow="hidden">
				{activeTab === 0 && (
					<StoryPanel data={data} isFocused={activeTab === 0} viewportHeight={panelHeight} />
				)}
				{activeTab === 1 && (
					<WalkthroughPanel data={data} isFocused={activeTab === 1} viewportHeight={panelHeight} />
				)}
				{activeTab === 2 && <SummaryPanel summary={data.summary} meta={data.meta} />}
				{activeTab === 3 && (
					<GroupsPanel groups={data.groups} files={data.files} isFocused={activeTab === 3} viewportHeight={panelHeight} />
				)}
				{activeTab === 4 && <FilesPanel files={data.files} isFocused={activeTab === 4} viewportHeight={panelHeight} />}
				{activeTab === 5 && (
					<NarrativePanel narrative={data.narrative} isFocused={activeTab === 5} viewportHeight={panelHeight} />
				)}
			</Box>

			<Footer context={onBack ? "Esc/q: back" : undefined} />
		</Box>
	);
}
