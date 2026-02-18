declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
	}
}

function gtag(command: string, ...args: unknown[]): void {
	window.gtag?.(command, ...args);
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
	gtag("event", name, params);
}

export function trackPageView(path: string, title?: string): void {
	gtag("event", "page_view", { page_path: path, page_title: title });
}

export const analytics = {
	analysisStarted: (fileCount: number) =>
		trackEvent("analysis_started", { file_count: fileCount }),

	analysisCompleted: (fileCount: number, durationSec: number) =>
		trackEvent("analysis_completed", { file_count: fileCount, duration_sec: durationSec }),

	analysisError: (errorType: string) =>
		trackEvent("analysis_error", { error_type: errorType }),

	tabChanged: (tab: string) =>
		trackEvent("tab_changed", { tab }),

	chatSent: () =>
		trackEvent("chat_sent"),

	chatCompleted: (durationSec: number, hasTools: boolean) =>
		trackEvent("chat_completed", { duration_sec: durationSec, has_tools: hasTools }),

	detailOpened: (kind: string) =>
		trackEvent("detail_opened", { kind }),

	themeChanged: (theme: string) =>
		trackEvent("theme_changed", { theme }),

	settingsOpened: () =>
		trackEvent("settings_opened"),

	settingsChanged: (field: string) =>
		trackEvent("settings_changed", { field }),

	sessionLoaded: () =>
		trackEvent("session_loaded"),

	reviewSubmitted: (event: string) =>
		trackEvent("review_submitted", { review_event: event }),

	agentUsed: (agent: string) =>
		trackEvent("agent_used", { agent }),

	updateClicked: () =>
		trackEvent("update_clicked"),

	featureUsed: (feature: string) =>
		trackEvent("feature_used", { feature }),
};
