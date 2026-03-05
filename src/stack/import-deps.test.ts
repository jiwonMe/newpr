import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeImportDependencies, rebuildGroupDeps, mergeImportCycleGroups } from "./import-deps.ts";

const tmpDirs: string[] = [];

function makeTmpRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "import-deps-"));
	tmpDirs.push(dir);
	return dir;
}

afterAll(() => {
	for (const dir of tmpDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

async function initRepo(path: string): Promise<void> {
	await Bun.$`git init ${path}`.quiet();
	await Bun.$`git -C ${path} config user.name "Test"`.quiet();
	await Bun.$`git -C ${path} config user.email "test@test.com"`.quiet();
}

async function commitFiles(repoPath: string, files: Record<string, string>, msg: string): Promise<string> {
	for (const [filePath, content] of Object.entries(files)) {
		const fullPath = join(repoPath, filePath);
		const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
		mkdirSync(dir, { recursive: true });
		writeFileSync(fullPath, content);
	}
	await Bun.$`git -C ${repoPath} add -A`.quiet();
	await Bun.$`git -C ${repoPath} commit -m ${msg}`.quiet();
	return (await Bun.$`git -C ${repoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();
}

describe("analyzeImportDependencies", () => {
	test("detects single-line imports between changed files", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/utils/helper.ts": "export function greet() { return 'hi'; }",
			"src/components/button.ts": "import { greet } from '../utils/helper';\nexport const btn = greet();",
		}, "add files");

		const ownership = new Map([
			["src/utils/helper.ts", "Utils"],
			["src/components/button.ts", "UI"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/components/button.ts")).toContain("src/utils/helper.ts");
		expect(result.groupDeps.get("UI")).toContain("Utils");
	});

	test("detects multiline named imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/types.ts": "export interface Foo {}\nexport interface Bar {}\nexport interface Baz {}",
			"src/consumer.ts": [
				"import {",
				"  Foo,",
				"  Bar,",
				"  Baz,",
				"} from './types';",
				"",
				"const x: Foo = {} as Foo;",
			].join("\n"),
		}, "multiline import");

		const ownership = new Map([
			["src/types.ts", "Types"],
			["src/consumer.ts", "Feature"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/consumer.ts")).toContain("src/types.ts");
		expect(result.groupDeps.get("Feature")).toContain("Types");
	});

	test("detects side-effect imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/setup.ts": "globalThis.__initialized = true;",
			"src/app.ts": "import './setup';\nconsole.log('app');",
		}, "side-effect");

		const ownership = new Map([
			["src/setup.ts", "Setup"],
			["src/app.ts", "App"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/app.ts")).toContain("src/setup.ts");
		expect(result.groupDeps.get("App")).toContain("Setup");
	});

	test("detects dynamic imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/lazy.ts": "export const LazyComponent = () => 'lazy';",
			"src/loader.ts": "export async function load() { const mod = await import('./lazy'); return mod; }",
		}, "dynamic import");

		const ownership = new Map([
			["src/lazy.ts", "Lazy"],
			["src/loader.ts", "Loader"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/loader.ts")).toContain("src/lazy.ts");
		expect(result.groupDeps.get("Loader")).toContain("Lazy");
	});

	test("detects re-exports (export from)", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/internal.ts": "export const SECRET = 42;",
			"src/index.ts": "export { SECRET } from './internal';",
		}, "re-export");

		const ownership = new Map([
			["src/internal.ts", "Core"],
			["src/index.ts", "Public"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/index.ts")).toContain("src/internal.ts");
		expect(result.groupDeps.get("Public")).toContain("Core");
	});

	test("detects type-only imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/types.ts": "export interface Config { key: string; }",
			"src/use-config.ts": "import type { Config } from './types';\nconst c: Config = { key: 'x' };",
		}, "type import");

		const ownership = new Map([
			["src/types.ts", "Types"],
			["src/use-config.ts", "Feature"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/use-config.ts")).toContain("src/types.ts");
		expect(result.groupDeps.get("Feature")).toContain("Types");
	});

	test("resolves extensionless imports to .ts files", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/utils.ts": "export const add = (a: number, b: number) => a + b;",
			"src/main.ts": "import { add } from './utils';\nconsole.log(add(1, 2));",
		}, "extensionless");

		const ownership = new Map([
			["src/utils.ts", "Utils"],
			["src/main.ts", "Main"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/main.ts")).toContain("src/utils.ts");
	});

	test("resolves index file imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/lib/index.ts": "export { default as Btn } from './button';",
			"src/lib/button.ts": "export default function Btn() { return 'btn'; }",
			"src/app.ts": "import { Btn } from './lib';\nconsole.log(Btn());",
		}, "index import");

		const ownership = new Map([
			["src/lib/index.ts", "Lib"],
			["src/lib/button.ts", "Lib"],
			["src/app.ts", "App"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/app.ts")).toContain("src/lib/index.ts");
		expect(result.groupDeps.get("App")).toContain("Lib");
	});

	test("ignores non-relative imports", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/app.ts": "import React from 'react';\nimport { useState } from 'react';\nconsole.log(React);",
		}, "npm imports");

		const ownership = new Map([["src/app.ts", "App"]]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.size).toBe(0);
		expect(result.groupDeps.size).toBe(0);
	});

	test("does not create self-group dependencies", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/a.ts": "export const A = 1;",
			"src/b.ts": "import { A } from './a';\nexport const B = A + 1;",
		}, "same group");

		const ownership = new Map([
			["src/a.ts", "Feature"],
			["src/b.ts", "Feature"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/b.ts")).toContain("src/a.ts");
		expect(result.groupDeps.size).toBe(0);
	});

	test("FSD feature: ui/ imports api/ across groups", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);
		await commitFiles(repo, { "dummy.txt": "init" }, "init");

		const headSha = await commitFiles(repo, {
			"src/features/chat-trace/api/use-chat-trace-summary-query.ts":
				"export function useChatTraceSummaryQuery() { return {}; }",
			"src/features/chat-trace/ui/chat-trace-table/chat-trace-table.body.tsx": [
				"import {",
				"  useChatTraceSummaryQuery,",
				"} from '../../api/use-chat-trace-summary-query';",
				"",
				"export function Body() { return useChatTraceSummaryQuery(); }",
			].join("\n"),
		}, "fsd feature");

		const ownership = new Map([
			["src/features/chat-trace/api/use-chat-trace-summary-query.ts", "API"],
			["src/features/chat-trace/ui/chat-trace-table/chat-trace-table.body.tsx", "UI"],
		]);

		const result = await analyzeImportDependencies(repo, headSha, [...ownership.keys()], ownership);

		expect(result.fileDeps.get("src/features/chat-trace/ui/chat-trace-table/chat-trace-table.body.tsx"))
			.toContain("src/features/chat-trace/api/use-chat-trace-summary-query.ts");
		expect(result.groupDeps.get("UI")).toContain("API");
	});
});

describe("rebuildGroupDeps", () => {
	test("recomputes group deps after file reassignment", () => {
		const fileDeps = new Map([
			["src/ui/button.ts", ["src/api/query.ts"]],
			["src/api/query.ts", ["src/types/schema.ts"]],
		]);

		const originalOwnership = new Map([
			["src/ui/button.ts", "UI"],
			["src/api/query.ts", "API"],
			["src/types/schema.ts", "Types"],
		]);

		const original = rebuildGroupDeps(fileDeps, originalOwnership);
		expect(original.get("UI")).toContain("API");
		expect(original.get("API")).toContain("Types");

		const reassignedOwnership = new Map([
			["src/ui/button.ts", "Feature"],
			["src/api/query.ts", "Feature"],
			["src/types/schema.ts", "Types"],
		]);

		const rebuilt = rebuildGroupDeps(fileDeps, reassignedOwnership);
		expect(rebuilt.has("UI")).toBe(false);
		expect(rebuilt.has("API")).toBe(false);
		expect(rebuilt.get("Feature")).toContain("Types");
	});

	test("drops stale edges when files move to same group", () => {
		const fileDeps = new Map([
			["src/a.ts", ["src/b.ts"]],
		]);

		const before = rebuildGroupDeps(fileDeps, new Map([
			["src/a.ts", "GroupA"],
			["src/b.ts", "GroupB"],
		]));
		expect(before.get("GroupA")).toContain("GroupB");

		const after = rebuildGroupDeps(fileDeps, new Map([
			["src/a.ts", "Merged"],
			["src/b.ts", "Merged"],
		]));
		expect(after.size).toBe(0);
	});
});

describe("mergeImportCycleGroups", () => {
	test("merges groups in a pairwise cycle (A↔B)", () => {
		const groups = [
			{ name: "GroupA", files: ["a.ts"], description: "Group A", key_changes: ["added a.ts"] },
			{ name: "GroupB", files: ["b.ts"], description: "Group B", key_changes: ["added b.ts"] },
			{ name: "GroupC", files: ["c.ts"], description: "Group C", key_changes: ["added c.ts"] },
		];
		const ownership = new Map([
			["a.ts", "GroupA"],
			["b.ts", "GroupB"],
			["c.ts", "GroupC"],
		]);
		// A→B and B→A form a cycle; C depends on A (no cycle)
		const groupDeps = new Map([
			["GroupA", ["GroupB"]],
			["GroupB", ["GroupA"]],
			["GroupC", ["GroupA"]],
		]);

		const result = mergeImportCycleGroups(groups, ownership, groupDeps);

		// A and B merged into one group, C remains
		expect(result.groups).toHaveLength(2);
		expect(result.mergedCycles).toHaveLength(1);
		expect(result.mergedCycles[0]).toHaveLength(2);

		// Survivor group has files from both A and B
		const survivor = result.groups.find((g) => g.files.includes("a.ts"))!;
		expect(survivor).toBeDefined();
		expect(survivor.files).toContain("b.ts");
		expect(survivor.key_changes).toContain("added a.ts");
		expect(survivor.key_changes).toContain("added b.ts");

		// Ownership updated: b.ts now points to survivor
		expect(result.ownership.get("b.ts")).toBe(survivor.name);
		expect(result.ownership.get("a.ts")).toBe(survivor.name);
	});

	test("merges groups in a transitive cycle (A→B→C→A)", () => {
		const groups = [
			{ name: "GroupA", files: ["a.ts"], description: "Group A" },
			{ name: "GroupB", files: ["b.ts"], description: "Group B" },
			{ name: "GroupC", files: ["c.ts"], description: "Group C" },
			{ name: "GroupD", files: ["d.ts"], description: "Group D" },
		];
		const ownership = new Map([
			["a.ts", "GroupA"],
			["b.ts", "GroupB"],
			["c.ts", "GroupC"],
			["d.ts", "GroupD"],
		]);
		// A→B→C→A forms a cycle; D is standalone
		const groupDeps = new Map([
			["GroupA", ["GroupB"]],
			["GroupB", ["GroupC"]],
			["GroupC", ["GroupA"]],
		]);

		const result = mergeImportCycleGroups(groups, ownership, groupDeps);

		// A, B, C merged into one group; D remains
		expect(result.groups).toHaveLength(2);
		expect(result.mergedCycles).toHaveLength(1);
		expect(result.mergedCycles[0]).toHaveLength(3);

		const survivor = result.groups.find((g) => g.files.includes("a.ts"))!;
		expect(survivor.files).toContain("b.ts");
		expect(survivor.files).toContain("c.ts");
		expect(survivor.files).not.toContain("d.ts");

		// All ownership for cycle members points to survivor
		expect(result.ownership.get("a.ts")).toBe(survivor.name);
		expect(result.ownership.get("b.ts")).toBe(survivor.name);
		expect(result.ownership.get("c.ts")).toBe(survivor.name);
		expect(result.ownership.get("d.ts")).toBe("GroupD");
	});

	test("no merge when no cycles exist", () => {
		const groups = [
			{ name: "GroupA", files: ["a.ts"], description: "Group A" },
			{ name: "GroupB", files: ["b.ts"], description: "Group B" },
			{ name: "GroupC", files: ["c.ts"], description: "Group C" },
		];
		const ownership = new Map([
			["a.ts", "GroupA"],
			["b.ts", "GroupB"],
			["c.ts", "GroupC"],
		]);
		// Linear chain: A→B→C (no cycles)
		const groupDeps = new Map([
			["GroupA", ["GroupB"]],
			["GroupB", ["GroupC"]],
		]);

		const result = mergeImportCycleGroups(groups, ownership, groupDeps);

		expect(result.groups).toHaveLength(3);
		expect(result.mergedCycles).toHaveLength(0);
		// Ownership unchanged
		expect(result.ownership.get("a.ts")).toBe("GroupA");
		expect(result.ownership.get("b.ts")).toBe("GroupB");
		expect(result.ownership.get("c.ts")).toBe("GroupC");
	});

	test("no merge when groups have no deps", () => {
		const groups = [
			{ name: "GroupA", files: ["a.ts"], description: "Group A" },
			{ name: "GroupB", files: ["b.ts"], description: "Group B" },
		];
		const ownership = new Map([
			["a.ts", "GroupA"],
			["b.ts", "GroupB"],
		]);
		const groupDeps = new Map<string, string[]>();

		const result = mergeImportCycleGroups(groups, ownership, groupDeps);

		expect(result.groups).toHaveLength(2);
		expect(result.mergedCycles).toHaveLength(0);
	});
});
