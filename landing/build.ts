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

console.log("Building HTML + JS (EN)...");
const result = await Bun.build({
	entrypoints: [join(srcDir, "index.html")],
	outdir: outDir,
	minify: true,
});

if (!result.success) {
	console.error("Build failed:");
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

const koOutDir = join(outDir, "ko");
mkdirSync(koOutDir, { recursive: true });

console.log("Building HTML + JS (KO)...");
const koResult = await Bun.build({
	entrypoints: [join(srcDir, "ko.html")],
	outdir: koOutDir,
	minify: true,
});

if (!koResult.success) {
	console.error("KO build failed:");
	for (const log of koResult.logs) console.error(log);
	process.exit(1);
}

const koHtmlPath = join(koOutDir, "ko.html");
const koIndexPath = join(koOutDir, "index.html");
try {
	const koHtml = await Bun.file(koHtmlPath).text();
	await Bun.write(koIndexPath, koHtml);
	rmSync(koHtmlPath, { force: true });
} catch {}

try { cpSync(join(srcDir, "CNAME"), join(outDir, "CNAME")); } catch {}
await Bun.write(join(outDir, ".nojekyll"), "");

console.log(`Built to ${outDir}`);
for (const output of result.outputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
for (const output of koResult.outputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
