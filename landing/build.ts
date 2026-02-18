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

console.log("Building HTML + JS...");
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

try { cpSync(join(srcDir, "CNAME"), join(outDir, "CNAME")); } catch {}
await Bun.write(join(outDir, ".nojekyll"), "");

console.log(`Built to ${outDir}`);
for (const output of result.outputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
