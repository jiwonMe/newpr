import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const GA_ID = "G-L3SL6T6JQ1";
const GA_SECRET = "Sier1nbXS2-eX2TR3j1kZQ";
const MP_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_SECRET}`;

const CONFIG_DIR = join(homedir(), ".newpr");
const TELEMETRY_FILE = join(CONFIG_DIR, "telemetry.json");

interface TelemetryConfig {
	client_id: string;
	consent: "granted" | "denied" | "pending";
}

let config: TelemetryConfig | null = null;

function ensureDir(): void {
	mkdirSync(CONFIG_DIR, { recursive: true });
}

async function loadConfig(): Promise<TelemetryConfig> {
	if (config) return config;
	try {
		const file = Bun.file(TELEMETRY_FILE);
		if (await file.exists()) {
			const data = JSON.parse(await file.text()) as Partial<TelemetryConfig>;
			config = {
				client_id: data.client_id || randomUUID(),
				consent: data.consent === "granted" || data.consent === "denied" ? data.consent : "pending",
			};
		} else {
			config = { client_id: randomUUID(), consent: "pending" };
		}
	} catch {
		config = { client_id: randomUUID(), consent: "pending" };
	}
	await saveConfig();
	return config;
}

async function saveConfig(): Promise<void> {
	if (!config) return;
	ensureDir();
	await Bun.write(TELEMETRY_FILE, `${JSON.stringify(config, null, 2)}\n`);
}

export async function getTelemetryConsent(): Promise<"granted" | "denied" | "pending"> {
	const cfg = await loadConfig();
	return cfg.consent;
}

export async function setTelemetryConsent(consent: "granted" | "denied"): Promise<void> {
	const cfg = await loadConfig();
	cfg.consent = consent;
	await saveConfig();
}

async function sendEvents(events: Array<{ name: string; params?: Record<string, string | number | boolean> }>): Promise<void> {
	const cfg = await loadConfig();
	if (cfg.consent !== "granted") return;

	const timestampMicros = String(Date.now() * 1000);
	const enrichedEvents = events.map((e) => ({
		name: e.name,
		params: {
			...e.params,
			engagement_time_msec: "100",
			session_id: cfg.client_id.replace(/-/g, "").slice(0, 16),
		},
	}));

	const body = {
		client_id: cfg.client_id,
		timestamp_micros: timestampMicros,
		non_personalized_ads: true,
		events: enrichedEvents,
	};

	try {
		await fetch(MP_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
	}
}

function track(name: string, params?: Record<string, string | number | boolean>): void {
	sendEvents([{ name, params }]);
}

export const telemetry = {
	serverStarted: (version: string) =>
		track("server_started", { version, platform: process.platform, arch: process.arch }),

	analysisStarted: (fileCount: number) =>
		track("analysis_started", { file_count: fileCount }),

	analysisCompleted: (fileCount: number, durationSec: number) =>
		track("analysis_completed", { file_count: fileCount, duration_sec: durationSec }),

	analysisError: (errorType: string) =>
		track("analysis_error", { error_type: errorType.slice(0, 100) }),

	chatSent: () =>
		track("chat_sent"),

	chatCompleted: (durationSec: number, hasTools: boolean) =>
		track("chat_completed", { duration_sec: durationSec, has_tools: hasTools }),

	reviewSubmitted: (event: string) =>
		track("review_submitted", { review_event: event }),

	stackStarted: () =>
		track("stack_started"),

	stackCompleted: (groupCount: number) =>
		track("stack_completed", { group_count: groupCount }),

	stackPublished: (prCount: number) =>
		track("stack_published", { pr_count: prCount }),
};
