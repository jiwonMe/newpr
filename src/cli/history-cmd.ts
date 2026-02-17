import { listSessions, loadSession, clearHistory, getHistoryPath } from "../history/store.ts";

const RISK_COLORS: Record<string, string> = {
	low: "\x1b[32m",
	medium: "\x1b[33m",
	high: "\x1b[31m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";

export async function handleHistory(subArgs: string[]): Promise<void> {
	const sub = subArgs[0];

	if (sub === "clear") {
		await clearHistory();
		console.log("History cleared.");
		return;
	}

	if (sub === "show") {
		const id = subArgs[1];
		if (!id) {
			console.error("Usage: newpr history show <session-id>");
			process.exit(1);
		}
		const data = await loadSession(id);
		if (!data) {
			console.error(`Session ${id} not found.`);
			process.exit(1);
		}
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "path") {
		console.log(getHistoryPath());
		return;
	}

	const limit = sub ? Number.parseInt(sub, 10) : 20;
	const sessions = await listSessions(Number.isNaN(limit) ? 20 : limit);

	if (sessions.length === 0) {
		console.log("No review history yet. Run `newpr` to analyze a PR.");
		return;
	}

	console.log(`${BOLD}${CYAN}Review History${RESET} ${DIM}(${sessions.length} sessions)${RESET}\n`);

	for (const s of sessions) {
		const riskColor = RISK_COLORS[s.risk_level] ?? RISK_COLORS.medium;
		const date = new Date(s.analyzed_at).toLocaleDateString();
		console.log(
			`  ${BOLD}#${s.pr_number}${RESET} ${s.pr_title}`,
		);
		console.log(
			`  ${DIM}${s.repo} │ ${s.author} │ ${date} │ ${riskColor}${s.risk_level}${RESET}${DIM} │ ${s.total_files} files │ +${s.total_additions} -${s.total_deletions}${RESET}`,
		);
		console.log(`  ${DIM}${s.summary_purpose}${RESET}`);
		console.log(`  ${DIM}id: ${s.id}${RESET}\n`);
	}
}
