import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import type { WorktreeSet } from "./types.ts";

const WORKTREE_ROOT = join(tmpdir(), "newpr-workspaces");

function worktreeDir(owner: string, repo: string, prNumber: number): string {
	return join(WORKTREE_ROOT, `${owner}-${repo}-pr-${prNumber}`);
}

export async function createWorktrees(
	bareRepoPath: string,
	baseBranch: string,
	prNumber: number,
	owner: string,
	repo: string,
	onProgress?: (msg: string) => void,
): Promise<WorktreeSet> {
	const dir = worktreeDir(owner, repo, prNumber);
	const basePath = join(dir, "base");
	const headPath = join(dir, "head");

	if (existsSync(basePath)) {
		await Bun.$`git -C ${bareRepoPath} worktree remove ${basePath} --force`.quiet().nothrow();
	}
	if (existsSync(headPath)) {
		await Bun.$`git -C ${bareRepoPath} worktree remove ${headPath} --force`.quiet().nothrow();
	}
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true });
	}

	onProgress?.(`Fetching PR #${prNumber} ref...`);
	await Bun.$`git -C ${bareRepoPath} fetch origin pull/${prNumber}/head:pr-${prNumber}`.quiet().nothrow();

	onProgress?.(`Checking out base branch (${baseBranch})...`);
	const baseResult = await Bun.$`git -C ${bareRepoPath} worktree add ${basePath} origin/${baseBranch}`.quiet().nothrow();
	if (baseResult.exitCode !== 0) {
		throw new Error(`worktree add base failed (exit ${baseResult.exitCode}): ${baseResult.stderr.toString().trim()}`);
	}

	onProgress?.(`Checking out PR head...`);
	const headResult = await Bun.$`git -C ${bareRepoPath} worktree add ${headPath} pr-${prNumber}`.quiet().nothrow();
	if (headResult.exitCode !== 0) {
		throw new Error(`worktree add head failed (exit ${headResult.exitCode}): ${headResult.stderr.toString().trim()}`);
	}

	return { basePath, headPath };
}

export async function cleanupWorktrees(
	bareRepoPath: string,
	prNumber: number,
	owner: string,
	repo: string,
): Promise<void> {
	const dir = worktreeDir(owner, repo, prNumber);
	const basePath = join(dir, "base");
	const headPath = join(dir, "head");

	await Bun.$`git -C ${bareRepoPath} worktree remove ${basePath} --force`.quiet().nothrow();
	await Bun.$`git -C ${bareRepoPath} worktree remove ${headPath} --force`.quiet().nothrow();

	if (existsSync(dir)) {
		rmSync(dir, { recursive: true });
	}

	await Bun.$`git -C ${bareRepoPath} worktree prune`.quiet().nothrow();
}
