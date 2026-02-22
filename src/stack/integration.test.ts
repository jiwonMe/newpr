import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractDeltas } from "./delta.ts";
import { applyCouplingRules } from "./coupling.ts";
import { checkFeasibility } from "./feasibility.ts";
import { createStackPlan } from "./plan.ts";
import { executeStack } from "./execute.ts";
import { verifyStack } from "./verify.ts";
import type { FileGroup } from "../types/output.ts";

const tmpDirs: string[] = [];

function makeTmpRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "stack-integ-"));
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

async function getSha(path: string): Promise<string> {
	return (await Bun.$`git -C ${path} rev-parse HEAD`.quiet()).stdout.toString().trim();
}

async function getTree(path: string, sha: string): Promise<string> {
	return (await Bun.$`git -C ${path} rev-parse ${sha}^{tree}`.quiet()).stdout.toString().trim();
}

async function runFullPipeline(
	repoPath: string,
	baseSha: string,
	headSha: string,
	groups: FileGroup[],
	ownership: Map<string, string>,
	groupOrder: string[],
) {
	const changedFiles = [...ownership.keys()];
	const coupled = applyCouplingRules(ownership, changedFiles, groupOrder);
	const deltas = await extractDeltas(repoPath, baseSha, headSha);
	const feasibility = checkFeasibility({ deltas, ownership: coupled.ownership });

	if (!feasibility.feasible || !feasibility.ordered_group_ids) {
		return { feasibility, plan: null, execResult: null, verifyResult: null };
	}

	const plan = await createStackPlan({
		repo_path: repoPath,
		base_sha: baseSha,
		head_sha: headSha,
		deltas,
		ownership: coupled.ownership,
		group_order: feasibility.ordered_group_ids,
		groups,
	});

	const execResult = await executeStack({
		repo_path: repoPath,
		plan,
		deltas,
		ownership: coupled.ownership,
		pr_author: { name: "Test", email: "test@test.com" },
		pr_number: 1,
		head_branch: "test-branch",
	});

	const verifyResult = await verifyStack({
		repo_path: repoPath,
		base_sha: baseSha,
		head_sha: headSha,
		exec_result: execResult,
		ownership: coupled.ownership,
	});

	return { feasibility, plan, execResult, verifyResult };
}

describe("integration: full stacking pipeline", () => {
	test("happy path with 3 groups", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);

		mkdirSync(join(repo, "src"), { recursive: true });
		writeFileSync(join(repo, "README.md"), "init\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Init"`.quiet();
		const base = await getSha(repo);

		writeFileSync(join(repo, "src", "auth.ts"), "export const auth = true;\n");
		await Bun.$`git -C ${repo} add src/auth.ts`.quiet();
		await Bun.$`git -C ${repo} commit -m "Add auth"`.quiet();

		writeFileSync(join(repo, "src", "api.ts"), "export const api = '/v1';\n");
		await Bun.$`git -C ${repo} add src/api.ts`.quiet();
		await Bun.$`git -C ${repo} commit -m "Add api"`.quiet();

		writeFileSync(join(repo, "src", "ui.tsx"), "export const UI = () => <div/>;\n");
		await Bun.$`git -C ${repo} add src/ui.tsx`.quiet();
		await Bun.$`git -C ${repo} commit -m "Add ui"`.quiet();
		const head = await getSha(repo);

		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth", files: ["src/auth.ts"] },
			{ name: "API", type: "feature", description: "API", files: ["src/api.ts"] },
			{ name: "UI", type: "feature", description: "UI", files: ["src/ui.tsx"] },
		];
		const ownership = new Map([
			["src/auth.ts", "Auth"],
			["src/api.ts", "API"],
			["src/ui.tsx", "UI"],
		]);

		const result = await runFullPipeline(repo, base, head, groups, ownership, ["Auth", "API", "UI"]);

		expect(result.feasibility.feasible).toBe(true);
		expect(result.plan!.groups.length).toBe(3);
		expect(result.execResult!.group_commits.length).toBe(3);
		expect(result.verifyResult!.verified).toBe(true);
		expect(result.verifyResult!.errors).toEqual([]);
		expect(result.verifyResult!.warnings).toBeDefined();

		const headTree = await getTree(repo, head);
		expect(result.execResult!.final_tree_sha).toBe(headTree);
	});

	test("file rename preserves tree equivalence", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);

		writeFileSync(join(repo, "old.ts"), "content\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Init"`.quiet();
		const base = await getSha(repo);

		await Bun.$`git -C ${repo} mv old.ts new.ts`.quiet();
		await Bun.$`git -C ${repo} commit -m "Rename"`.quiet();
		const head = await getSha(repo);

		const groups: FileGroup[] = [
			{ name: "Rename", type: "refactor", description: "Rename file", files: ["old.ts", "new.ts"] },
		];
		const ownership = new Map([
			["old.ts", "Rename"],
			["new.ts", "Rename"],
		]);

		const result = await runFullPipeline(repo, base, head, groups, ownership, ["Rename"]);

		expect(result.feasibility.feasible).toBe(true);
		expect(result.verifyResult!.verified).toBe(true);

		const headTree = await getTree(repo, head);
		expect(result.execResult!.final_tree_sha).toBe(headTree);
	});

	test("file deletion preserves tree equivalence", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);

		writeFileSync(join(repo, "keep.ts"), "keep\n");
		writeFileSync(join(repo, "remove.ts"), "remove\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Init"`.quiet();
		const base = await getSha(repo);

		await Bun.$`git -C ${repo} rm remove.ts`.quiet();
		await Bun.$`git -C ${repo} commit -m "Delete"`.quiet();
		const head = await getSha(repo);

		const groups: FileGroup[] = [
			{ name: "Cleanup", type: "chore", description: "Remove file", files: ["remove.ts"] },
		];
		const ownership = new Map([["remove.ts", "Cleanup"]]);

		const result = await runFullPipeline(repo, base, head, groups, ownership, ["Cleanup"]);

		expect(result.feasibility.feasible).toBe(true);
		expect(result.verifyResult!.verified).toBe(true);

		const headTree = await getTree(repo, head);
		expect(result.execResult!.final_tree_sha).toBe(headTree);
	});

	test("single group stacks to one commit", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);

		writeFileSync(join(repo, "a.ts"), "a\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Init"`.quiet();
		const base = await getSha(repo);

		writeFileSync(join(repo, "a.ts"), "a-updated\n");
		writeFileSync(join(repo, "b.ts"), "b-new\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Changes"`.quiet();
		const head = await getSha(repo);

		const groups: FileGroup[] = [
			{ name: "Single", type: "feature", description: "All changes", files: ["a.ts", "b.ts"] },
		];
		const ownership = new Map([
			["a.ts", "Single"],
			["b.ts", "Single"],
		]);

		const result = await runFullPipeline(repo, base, head, groups, ownership, ["Single"]);

		expect(result.feasibility.feasible).toBe(true);
		expect(result.execResult!.group_commits.length).toBe(1);
		expect(result.verifyResult!.verified).toBe(true);

		const headTree = await getTree(repo, head);
		expect(result.execResult!.final_tree_sha).toBe(headTree);
	});

	test("declared dependency cycle is detected as infeasible", async () => {
		const repo = makeTmpRepo();
		await initRepo(repo);

		mkdirSync(join(repo, "src"), { recursive: true });
		writeFileSync(join(repo, "src", "a.ts"), "a\n");
		writeFileSync(join(repo, "src", "b.ts"), "b\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Init"`.quiet();
		const base = await getSha(repo);

		writeFileSync(join(repo, "src", "a.ts"), "a-v2\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Update a"`.quiet();

		writeFileSync(join(repo, "src", "b.ts"), "b-v2\n");
		await Bun.$`git -C ${repo} add -A`.quiet();
		await Bun.$`git -C ${repo} commit -m "Update b"`.quiet();
		const head = await getSha(repo);

		const ownership = new Map([
			["src/a.ts", "GroupA"],
			["src/b.ts", "GroupB"],
		]);

		const deltas = await extractDeltas(repo, base, head);
		const feasibility = checkFeasibility({
			deltas,
			ownership,
			declared_deps: new Map([
				["GroupA", ["GroupB"]],
				["GroupB", ["GroupA"]],
			]),
		});

		expect(feasibility.feasible).toBe(true);
		expect(feasibility.ordered_group_ids).toHaveLength(2);
	});
});
