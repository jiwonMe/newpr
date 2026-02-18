const PACKAGE_NAME = "newpr";

interface UpdateInfo {
	current: string;
	latest: string;
	needsUpdate: boolean;
}

interface CachedCheck {
	latest: string;
	checkedAt: number;
}

async function readCache(): Promise<CachedCheck | null> {
	try {
		const file = Bun.file(`${process.env.HOME}/.newpr/update-cache.json`);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as CachedCheck;
	} catch {
		return null;
	}
}

async function writeCache(latest: string): Promise<void> {
	const dir = `${process.env.HOME}/.newpr`;
	const { mkdirSync } = await import("node:fs");
	try { mkdirSync(dir, { recursive: true }); } catch {}
	await Bun.write(`${dir}/update-cache.json`, JSON.stringify({ latest, checkedAt: Date.now() }));
}

async function fetchLatestVersion(): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		clearTimeout(timeout);
		if (!res.ok) return null;
		const data = await res.json() as { version?: string };
		return data.version ?? null;
	} catch {
		return null;
	}
}

function compareVersions(current: string, latest: string): boolean {
	const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
	const c = parse(current);
	const l = parse(latest);
	for (let i = 0; i < 3; i++) {
		if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
		if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
	}
	return false;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
	const latest = await fetchLatestVersion();
	if (latest) await writeCache(latest);

	const version = latest ?? (await readCache())?.latest;
	if (!version) return null;
	if (!compareVersions(currentVersion, version)) return null;
	return { current: currentVersion, latest: version, needsUpdate: true };
}

export function printUpdateNotice(info: UpdateInfo): void {
	const msg = [
		"",
		`  \x1b[33m⚡\x1b[0m Update available: \x1b[2m${info.current}\x1b[0m → \x1b[32m${info.latest}\x1b[0m`,
		`    Run \x1b[36mbun add -g ${PACKAGE_NAME}\x1b[0m to update`,
		"",
	].join("\n");
	process.stderr.write(msg);
}
