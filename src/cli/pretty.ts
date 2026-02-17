import type { NewprOutput } from "../types/output.ts";

const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

const RISK_COLORS: Record<string, string> = {
	low: COLORS.green,
	medium: COLORS.yellow,
	high: COLORS.red,
};

const GROUP_TYPE_ICONS: Record<string, string> = {
	feature: "+",
	refactor: "~",
	bugfix: "!",
	chore: "*",
	docs: "#",
	test: "T",
	config: "C",
};

function line(char = "─", length = 60): string {
	return char.repeat(length);
}

export function formatPretty(output: NewprOutput): string {
	const lines: string[] = [];

	lines.push("");
	lines.push(`${COLORS.bold}${COLORS.cyan}${line("═")}${COLORS.reset}`);
	lines.push(`${COLORS.bold}  PR #${output.meta.pr_number}: ${output.meta.pr_title}${COLORS.reset}`);
	lines.push(`${COLORS.dim}  ${output.meta.author} | ${output.meta.base_branch} <- ${output.meta.head_branch}${COLORS.reset}`);
	lines.push(`${COLORS.dim}  ${output.meta.total_files_changed} files | +${output.meta.total_additions} -${output.meta.total_deletions}${COLORS.reset}`);
	lines.push(`${COLORS.bold}${COLORS.cyan}${line("═")}${COLORS.reset}`);

	lines.push("");
	lines.push(`${COLORS.bold}SUMMARY${COLORS.reset}`);
	lines.push(`${line("─")}`);
	lines.push(`  Purpose: ${output.summary.purpose}`);
	lines.push(`  Scope:   ${output.summary.scope}`);
	lines.push(`  Impact:  ${output.summary.impact}`);
	const riskColor = RISK_COLORS[output.summary.risk_level] ?? COLORS.yellow;
	lines.push(`  Risk:    ${riskColor}${output.summary.risk_level.toUpperCase()}${COLORS.reset}`);

	lines.push("");
	lines.push(`${COLORS.bold}CHANGE GROUPS${COLORS.reset}`);
	lines.push(`${line("─")}`);
	for (const group of output.groups) {
		const icon = GROUP_TYPE_ICONS[group.type] ?? "*";
		lines.push(`  ${COLORS.bold}[${icon}] ${group.name}${COLORS.reset} ${COLORS.dim}(${group.type}, ${group.files.length} files)${COLORS.reset}`);
		lines.push(`      ${group.description}`);
	}

	lines.push("");
	lines.push(`${COLORS.bold}FILES${COLORS.reset}`);
	lines.push(`${line("─")}`);
	for (const file of output.files) {
		const statusIcon = file.status === "added" ? `${COLORS.green}A` : file.status === "deleted" ? `${COLORS.red}D` : file.status === "renamed" ? `${COLORS.blue}R` : `${COLORS.yellow}M`;
		lines.push(`  ${statusIcon}${COLORS.reset} ${file.path} ${COLORS.dim}(+${file.additions}/-${file.deletions})${COLORS.reset}`);
		lines.push(`    ${COLORS.dim}${file.summary}${COLORS.reset}`);
	}

	lines.push("");
	lines.push(`${COLORS.bold}NARRATIVE${COLORS.reset}`);
	lines.push(`${line("─")}`);
	lines.push(output.narrative);
	lines.push("");

	return lines.join("\n");
}
