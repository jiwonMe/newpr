import { join } from "node:path";
import type { StackExecResult } from "./types.ts";

const LOCKFILES = [
	"package.json",
	"bun.lock",
	"bun.lockb",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
];

interface QualityGateInput {
	repo_path: string;
	exec_result: StackExecResult;
	onProgress?: (message: string) => void;
	checkAborted?: () => void;
}

interface PackageJson {
	scripts?: Record<string, string>;
	packageManager?: string;
}

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

async function runProcess(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(args, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CI: "true" },
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

async function readPackageJson(worktreePath: string): Promise<PackageJson | null> {
	const filePath = join(worktreePath, "package.json");
	const file = Bun.file(filePath);
	if (!(await file.exists())) return null;
	try {
		const parsed = JSON.parse(await file.text()) as PackageJson;
		return parsed;
	} catch {
		return null;
	}
}

async function which(cmd: string): Promise<string | null> {
	try {
		const result = await Bun.$`which ${cmd}`.text();
		return result.trim() || null;
	} catch {
		return null;
	}
}

function parsePackageManagerField(value: string | undefined): PackageManager | null {
	if (!value) return null;
	const name = value.split("@")[0]?.trim().toLowerCase();
	if (name === "bun" || name === "pnpm" || name === "yarn" || name === "npm") return name;
	return null;
}

async function detectPackageManager(pkg: PackageJson, worktreePath: string): Promise<PackageManager> {
	const fromField = parsePackageManagerField(pkg.packageManager);
	if (fromField) return fromField;

	if (await Bun.file(join(worktreePath, "bun.lock")).exists()) return "bun";
	if (await Bun.file(join(worktreePath, "bun.lockb")).exists()) return "bun";
	if (await Bun.file(join(worktreePath, "pnpm-lock.yaml")).exists()) return "pnpm";
	if (await Bun.file(join(worktreePath, "yarn.lock")).exists()) return "yarn";
	if (await Bun.file(join(worktreePath, "package-lock.json")).exists()) return "npm";

	return "npm";
}


function installCommandCandidates(manager: PackageManager): string[][] {
	if (manager === "bun") return [["bun", "install"]];
	if (manager === "pnpm") return [["pnpm", "install", "--frozen-lockfile"], ["pnpm", "install"]];
	if (manager === "yarn") return [["yarn", "install", "--immutable"], ["yarn", "install", "--frozen-lockfile"], ["yarn", "install"]];
	return [["npm", "ci"], ["npm", "install"]];
}

function runScriptCommand(manager: PackageManager, script: string): string[] {
	if (manager === "bun") return ["bun", "run", script];
	if (manager === "pnpm") return ["pnpm", "run", script];
	if (manager === "yarn") return ["yarn", "run", script];
	return ["npm", "run", script];
}

function selectRequiredScripts(pkg: PackageJson): string[] {
	const scripts = pkg.scripts ?? {};
	const required: string[] = [];
	if (typeof scripts.lint === "string" && scripts.lint.trim()) required.push("lint");
	if (typeof scripts.build === "string" && scripts.build.trim()) required.push("build");
	return required;
}

function trimOutput(text: string, maxChars = 2500): string {
	if (text.length <= maxChars) return text;
	return text.slice(text.length - maxChars);
}

async function depsChanged(repoPath: string, prevCommit: string, nextCommit: string): Promise<boolean> {
	if (!prevCommit) return true;
	const result = await Bun.$`git -C ${repoPath} diff --name-only ${prevCommit} ${nextCommit} -- ${LOCKFILES}`.quiet().nothrow();
	if (result.exitCode !== 0) return true;
	return result.stdout.toString().trim().length > 0;
}

async function installDependencies(worktreePath: string, manager: PackageManager): Promise<boolean> {
	const candidates = installCommandCandidates(manager);

	for (const cmd of candidates) {
		const install = await runProcess(cmd, worktreePath);
		if (install.exitCode === 0) return true;
	}

	return false;
}

export interface QualityGateResult {
	ran: boolean;
	skippedReason?: string;
	groupResults: Array<{
		group_id: string;
		passed: boolean;
		skipped: boolean;
		scripts: Array<{ name: string; passed: boolean; error?: string }>;
	}>;
}

export async function runStackQualityGate(input: QualityGateInput): Promise<QualityGateResult> {
	const { repo_path, exec_result, onProgress, checkAborted } = input;
	if (exec_result.group_commits.length === 0) {
		return { ran: false, skippedReason: "No group commits", groupResults: [] };
	}

	const topCommit = exec_result.group_commits[exec_result.group_commits.length - 1];
	if (!topCommit) {
		return { ran: false, skippedReason: "No top commit found", groupResults: [] };
	}

	const worktreePath = `/tmp/newpr-stack-quality-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const addWorktree = await Bun.$`git -C ${repo_path} worktree add --detach ${worktreePath} ${topCommit.commit_sha}`.quiet().nothrow();
	if (addWorktree.exitCode !== 0) {
		return { ran: false, skippedReason: `Failed to prepare worktree: ${addWorktree.stderr.toString().trim()}`, groupResults: [] };
	}

	let prevCommit = "";
	let installReady = false;
	let currentManager: PackageManager | null = null;
	const groupResults: QualityGateResult["groupResults"] = [];

	try {
		checkAborted?.();

		const topPkg = await readPackageJson(worktreePath);
		if (!topPkg) {
			return { ran: false, skippedReason: "package.json not found — quality gate skipped", groupResults: [] };
		}

		const requiredScripts = selectRequiredScripts(topPkg);
		if (requiredScripts.length === 0) {
			return { ran: false, skippedReason: "No lint/build scripts in package.json — quality gate skipped", groupResults: [] };
		}

		for (const [i, commit] of exec_result.group_commits.entries()) {
			checkAborted?.();
			const total = exec_result.group_commits.length;
			const label = `Quality gate ${i + 1}/${total}`;

			onProgress?.(`${label}: checking ${commit.group_id}...`);
			const checkout = await Bun.$`git -C ${worktreePath} checkout -f ${commit.commit_sha}`.quiet().nothrow();
			if (checkout.exitCode !== 0) {
				groupResults.push({ group_id: commit.group_id, passed: false, skipped: true, scripts: [] });
				onProgress?.(`${label}: checkout failed for ${commit.group_id}, skipping`);
				continue;
			}

			const pkg = await readPackageJson(worktreePath);
			if (!pkg) {
				groupResults.push({ group_id: commit.group_id, passed: false, skipped: true, scripts: [] });
				onProgress?.(`${label}: package.json missing in ${commit.group_id}, skipping`);
				continue;
			}

			const manager = await detectPackageManager(pkg, worktreePath);
			if (manager !== currentManager) {
				const available = await which(manager);
				if (!available) {
					groupResults.push({ group_id: commit.group_id, passed: false, skipped: true, scripts: [] });
					onProgress?.(`${label}: ${manager} not installed, skipping quality gate`);
					continue;
				}
				currentManager = manager;
				installReady = false;
			}

			if (!installReady || await depsChanged(repo_path, prevCommit, commit.commit_sha)) {
				onProgress?.(`${label}: installing dependencies with ${manager}...`);
				const installed = await installDependencies(worktreePath, manager);
				if (!installed) {
					onProgress?.(`${label}: dependency install failed (${manager}) — skipping quality gate for remaining groups`);
					for (let j = i; j < exec_result.group_commits.length; j++) {
						groupResults.push({ group_id: exec_result.group_commits[j]!.group_id, passed: false, skipped: true, scripts: [] });
					}
					return { ran: true, skippedReason: `Dependency install failed (${manager}) — likely missing env tokens or registry config`, groupResults };
				}
				installReady = true;
			}

			const scripts = pkg.scripts ?? {};
			const scriptResults: Array<{ name: string; passed: boolean; error?: string }> = [];
			let allPassed = true;

			for (const script of requiredScripts) {
				if (typeof scripts[script] !== "string" || !scripts[script]?.trim()) {
					scriptResults.push({ name: script, passed: false, error: `script "${script}" not defined` });
					allPassed = false;
					continue;
				}

				checkAborted?.();
				const runCmd = runScriptCommand(manager, script);
				onProgress?.(`${label}: ${runCmd.join(" ")}`);
				const run = await runProcess(runCmd, worktreePath);
				if (run.exitCode !== 0) {
					const output = trimOutput(`${run.stdout}\n${run.stderr}`.trim());
					scriptResults.push({ name: script, passed: false, error: output });
					allPassed = false;
				} else {
					scriptResults.push({ name: script, passed: true });
				}
			}

			groupResults.push({ group_id: commit.group_id, passed: allPassed, skipped: false, scripts: scriptResults });
			prevCommit = commit.commit_sha;
		}
	} finally {
		await Bun.$`git -C ${repo_path} worktree remove --force ${worktreePath}`.quiet().nothrow();
		await Bun.$`rm -rf ${worktreePath}`.quiet().nothrow();
	}

	const anyFailed = groupResults.some((g) => !g.passed && !g.skipped);
	if (anyFailed) {
		const failures = groupResults
			.filter((g) => !g.passed && !g.skipped)
			.map((g) => {
				const failedScripts = g.scripts.filter((s) => !s.passed).map((s) => s.name).join(", ");
				return `${g.group_id} (${failedScripts})`;
			});
		throw new Error(`Quality gate failed: ${failures.join("; ")}`);
	}

	return { ran: true, groupResults };
}
