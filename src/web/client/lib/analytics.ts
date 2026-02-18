declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
		dataLayer?: unknown[];
	}
}

const GA_ID = "G-L3SL6T6JQ1";
const CONSENT_KEY = "newpr-analytics-consent";

export type ConsentState = "granted" | "denied" | "pending";

export function getConsent(): ConsentState {
	const stored = localStorage.getItem(CONSENT_KEY);
	if (stored === "granted" || stored === "denied") return stored;
	return "pending";
}

export function setConsent(state: "granted" | "denied"): void {
	localStorage.setItem(CONSENT_KEY, state);
	if (state === "granted") {
		loadGA();
	} else {
		disableGA();
	}
}

let gaLoaded = false;

function loadGA(): void {
	if (gaLoaded) return;
	gaLoaded = true;

	const script = document.createElement("script");
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
	document.head.appendChild(script);

	window.dataLayer = window.dataLayer || [];
	window.gtag = function (...args: unknown[]) {
		window.dataLayer!.push(args);
	};
	window.gtag("js", new Date());
	window.gtag("config", GA_ID);
}

function disableGA(): void {
	(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
}

export function initAnalytics(): void {
	if (getConsent() === "granted") {
		loadGA();
	}
}

function gtag(command: string, ...args: unknown[]): void {
	if (getConsent() !== "granted") return;
	window.gtag?.(command, ...args);
}

function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
	gtag("event", name, params);
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
