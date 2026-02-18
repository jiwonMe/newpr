import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

let cached: string | null = null;

export function getVersion(): string {
	if (cached) return cached;
	try {
		let dir = dirname(new URL(import.meta.url).pathname);
		for (let i = 0; i < 5; i++) {
			try {
				const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8")) as { version?: string };
				if (pkg.version) {
					cached = pkg.version;
					return cached;
				}
			} catch {}
			dir = dirname(dir);
		}
	} catch {}
	cached = "0.0.0";
	return cached;
}
