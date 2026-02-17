import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const REPOS_DIR = join(homedir(), ".newpr", "repos");
const FETCH_COOLDOWN_MS = 5 * 60 * 1000;

function bareRepoPath(owner: string, repo: string): string {
	return join(REPOS_DIR, "github.com", owner, `${repo}.git`);
}

function stampPath(repoPath: string): string {
	return join(repoPath, ".newpr-fetched");
}

function needsFetch(repoPath: string): boolean {
	const stamp = stampPath(repoPath);
	if (!existsSync(stamp)) return true;
	try {
		const ts = Number(readFileSync(stamp, "utf-8").trim());
		return Date.now() - ts > FETCH_COOLDOWN_MS;
	} catch {
		return true;
	}
}

function touchFetchStamp(repoPath: string): void {
	writeFileSync(stampPath(repoPath), String(Date.now()));
}

export async function ensureRepo(
	owner: string,
	repo: string,
	token: string,
	onProgress?: (msg: string) => void,
): Promise<string> {
	const repoPath = bareRepoPath(owner, repo);

	if (existsSync(join(repoPath, "HEAD"))) {
		if (needsFetch(repoPath)) {
			onProgress?.("Fetching latest changes...");
			const fetch = await Bun.$`git -C ${repoPath} fetch --all --prune`.quiet().nothrow();
			if (fetch.exitCode !== 0) {
				throw new Error(`git fetch failed (exit ${fetch.exitCode}): ${fetch.stderr.toString().trim()}`);
			}
			touchFetchStamp(repoPath);
		} else {
			onProgress?.("Repository cache is fresh.");
		}
		return repoPath;
	}

	const parentDir = join(repoPath, "..");
	mkdirSync(parentDir, { recursive: true });

	const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
	onProgress?.(`Cloning ${owner}/${repo}...`);
	const clone = await Bun.$`git clone --bare ${cloneUrl} ${repoPath}`.quiet().nothrow();
	if (clone.exitCode !== 0) {
		throw new Error(`git clone failed (exit ${clone.exitCode}): ${clone.stderr.toString().trim()}`);
	}
	touchFetchStamp(repoPath);

	return repoPath;
}

export function getReposDir(): string {
	return REPOS_DIR;
}
