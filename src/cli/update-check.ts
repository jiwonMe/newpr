const PACKAGE_NAME = "newpr";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

interface UpdateInfo {
	current: string;
	latest: string;
	needsUpdate: boolean;
}

async function getLastCheckTime(): Promise<number> {
	try {
		const file = Bun.file(`${process.env.HOME}/.newpr/last-update-check`);
		const text = await file.text();
		return Number.parseInt(text.trim(), 10) || 0;
	} catch {
		return 0;
	}
}

async function setLastCheckTime(): Promise<void> {
	const dir = `${process.env.HOME}/.newpr`;
	const { mkdirSync } = await import("node:fs");
	try { mkdirSync(dir, { recursive: true }); } catch {}
	await Bun.write(`${dir}/last-update-check`, String(Date.now()));
}

async function fetchLatestVersion(): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
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
	const lastCheck = await getLastCheckTime();
	if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return null;

	const latest = await fetchLatestVersion();
	await setLastCheckTime();

	if (!latest) return null;
	if (!compareVersions(currentVersion, latest)) return null;

	return { current: currentVersion, latest, needsUpdate: true };
}

export function printUpdateNotice(info: UpdateInfo): void {
	const msg = [
		"",
		`  Update available: ${info.current} → \x1b[32m${info.latest}\x1b[0m`,
		`  Run \x1b[36mbun add -g ${PACKAGE_NAME}\x1b[0m to update`,
		"",
	].join("\n");
	process.stderr.write(msg);
}
