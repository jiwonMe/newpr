import { join } from "node:path";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const outDir = join(import.meta.dir, "..", "docs");
const srcDir = import.meta.dir;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("Building Tailwind CSS...");
const tw = Bun.spawnSync(
	["bunx", "@tailwindcss/cli", "-i", join(srcDir, "src/styles.css"), "-o", join(srcDir, "src/built.css"), "--minify"],
	{ cwd: srcDir, stdout: "inherit", stderr: "inherit" },
);
if (tw.exitCode !== 0) {
	console.error("Tailwind build failed");
	process.exit(1);
}

async function buildEntrypoint(label: string, entrypoint: string, outdir: string) {
	console.log(`Building HTML + JS (${label})...`);
	const result = await Bun.build({
		entrypoints: [entrypoint],
		outdir,
		minify: true,
	});
	if (!result.success) {
		console.error(`${label} build failed:`);
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	return result.outputs;
}

const outputs = [
	...await buildEntrypoint("EN Home", join(srcDir, "index.html"), outDir),
	...await buildEntrypoint("EN Article", join(srcDir, "stacking-principles.html"), outDir),
];

const koOutDir = join(outDir, "ko");
mkdirSync(koOutDir, { recursive: true });

const koOutputs = [
	...await buildEntrypoint("KO Home", join(srcDir, "ko.html"), koOutDir),
	...await buildEntrypoint("KO Article", join(srcDir, "stacking-principles-ko.html"), koOutDir),
];

const koHtmlPath = join(koOutDir, "ko.html");
const koIndexPath = join(koOutDir, "index.html");
const koStackingHtmlPath = join(koOutDir, "stacking-principles-ko.html");
const koStackingIndexPath = join(koOutDir, "stacking-principles.html");
try {
	const koHtml = await Bun.file(koHtmlPath).text();
	await Bun.write(koIndexPath, koHtml);
	rmSync(koHtmlPath, { force: true });
} catch {}

try {
	const koStackingHtml = await Bun.file(koStackingHtmlPath).text();
	await Bun.write(koStackingIndexPath, koStackingHtml);
	rmSync(koStackingHtmlPath, { force: true });
} catch {}

try { cpSync(join(srcDir, "CNAME"), join(outDir, "CNAME")); } catch {}
await Bun.write(join(outDir, ".nojekyll"), "");

console.log(`Built to ${outDir}`);
for (const output of outputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
for (const output of koOutputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
