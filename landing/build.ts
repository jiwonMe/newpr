import { join } from "node:path";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const outDir = join(import.meta.dir, "..", "docs");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = await Bun.build({
	entrypoints: [join(import.meta.dir, "index.html")],
	outdir: outDir,
	minify: true,
});

if (!result.success) {
	console.error("Build failed:");
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

try { cpSync(join(import.meta.dir, "CNAME"), join(outDir, "CNAME")); } catch {}
await Bun.write(join(outDir, ".nojekyll"), "");

console.log(`Built to ${outDir}`);
for (const output of result.outputs) {
	console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)}kb)`);
}
