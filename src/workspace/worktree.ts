import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import type { WorktreeSet } from "./types.ts";

const WORKTREE_ROOT = join(tmpdir(), "newpr-workspaces");

function worktreeDir(owner: string, repo: string, prNumber: number): string {
	return join(WORKTREE_ROOT, `${owner}-${repo}-pr-${prNumber}`);
}

async function pruneAndCleanAll(bareRepoPath: string): Promise<void> {
	await Bun.$`git -C ${bareRepoPath} worktree prune`.quiet().nothrow();

	const listResult = await Bun.$`git -C ${bareRepoPath} worktree list --porcelain`.quiet().nothrow();
	if (listResult.exitCode !== 0) return;

	const lines = listResult.stdout.toString().split("\n");
	for (const line of lines) {
		if (!line.startsWith("worktree ")) continue;
		const wtPath = line.slice("worktree ".length).trim();
		if (wtPath === bareRepoPath) continue;
		if (wtPath.startsWith(WORKTREE_ROOT) && !existsSync(wtPath)) {
			await Bun.$`git -C ${bareRepoPath} worktree remove ${wtPath} --force`.quiet().nothrow();
		}
	}

	await Bun.$`git -C ${bareRepoPath} worktree prune`.quiet().nothrow();
}

async function forceRemoveWorktree(bareRepoPath: string, wtPath: string): Promise<void> {
	await Bun.$`git -C ${bareRepoPath} worktree remove ${wtPath} --force`.quiet().nothrow();
	if (existsSync(wtPath)) {
		rmSync(wtPath, { recursive: true });
	}
	await Bun.$`git -C ${bareRepoPath} worktree prune`.quiet().nothrow();
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

	await pruneAndCleanAll(bareRepoPath);

	await forceRemoveWorktree(bareRepoPath, basePath);
	await forceRemoveWorktree(bareRepoPath, headPath);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true });
	}

	onProgress?.(`Fetching PR #${prNumber} ref...`);
	await Bun.$`git -C ${bareRepoPath} fetch origin pull/${prNumber}/head:pr-${prNumber}`.quiet().nothrow();

	onProgress?.(`Checking out base branch (${baseBranch})...`);
	let baseResult = await Bun.$`git -C ${bareRepoPath} worktree add ${basePath} ${baseBranch}`.quiet().nothrow();

	if (baseResult.exitCode !== 0) {
		const stderr = baseResult.stderr.toString();
		if (stderr.includes("already checked out") || stderr.includes("is already used by")) {
			onProgress?.(`Branch '${baseBranch}' locked by another worktree, cleaning up...`);
			await pruneAndCleanAll(bareRepoPath);
			const lockResult = await Bun.$`git -C ${bareRepoPath} worktree list --porcelain`.quiet().nothrow();
			const lockLines = lockResult.stdout.toString().split("\n");
			for (let i = 0; i < lockLines.length; i++) {
				const branchLine = lockLines[i];
				if (branchLine && branchLine.includes(`branch refs/heads/${baseBranch}`)) {
					const wtLine = lockLines.slice(0, i).reverse().find((l) => l.startsWith("worktree "));
					if (wtLine) {
						const conflictPath = wtLine.slice("worktree ".length).trim();
						if (conflictPath !== bareRepoPath) {
							await forceRemoveWorktree(bareRepoPath, conflictPath);
						}
					}
				}
			}
			baseResult = await Bun.$`git -C ${bareRepoPath} worktree add ${basePath} ${baseBranch}`.quiet().nothrow();
		}

		if (baseResult.exitCode !== 0) {
			onProgress?.(`Falling back to detached HEAD for ${baseBranch}...`);
			baseResult = await Bun.$`git -C ${bareRepoPath} worktree add --detach ${basePath} ${baseBranch}`.quiet().nothrow();
		}

		if (baseResult.exitCode !== 0) {
			const errMsg = baseResult.stderr.toString().trim();
			throw new Error(`worktree add base failed (exit ${baseResult.exitCode}): ${errMsg}`);
		}
	}

	onProgress?.(`Checking out PR head...`);
	let headResult = await Bun.$`git -C ${bareRepoPath} worktree add ${headPath} pr-${prNumber}`.quiet().nothrow();
	if (headResult.exitCode !== 0) {
		headResult = await Bun.$`git -C ${bareRepoPath} worktree add --detach ${headPath} pr-${prNumber}`.quiet().nothrow();
	}
	if (headResult.exitCode !== 0) {
		const errMsg = headResult.stderr.toString().trim();
		throw new Error(`worktree add head failed (exit ${headResult.exitCode}): ${errMsg}`);
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

	await forceRemoveWorktree(bareRepoPath, basePath);
	await forceRemoveWorktree(bareRepoPath, headPath);

	if (existsSync(dir)) {
		rmSync(dir, { recursive: true });
	}

	await Bun.$`git -C ${bareRepoPath} worktree prune`.quiet().nothrow();
}
