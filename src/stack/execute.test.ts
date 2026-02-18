import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStackPlan } from "./plan.ts";
import { executeStack } from "./execute.ts";
import { extractDeltas } from "./delta.ts";
import type { FileGroup } from "../types/output.ts";

let testRepoPath: string;
let baseSha: string;
let headSha: string;

beforeAll(async () => {
	testRepoPath = mkdtempSync(join(tmpdir(), "exec-test-"));

	await Bun.$`git init ${testRepoPath}`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.name "Test User"`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.email "test@example.com"`.quiet();

	writeFileSync(join(testRepoPath, "README.md"), "initial\n");
	await Bun.$`git -C ${testRepoPath} add README.md`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Initial commit"`.quiet();

	baseSha = (await Bun.$`git -C ${testRepoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();

	mkdirSync(join(testRepoPath, "src"), { recursive: true });
	writeFileSync(join(testRepoPath, "src", "auth.ts"), "export const auth = true;\n");
	await Bun.$`git -C ${testRepoPath} add src/auth.ts`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Add auth module"`.quiet();

	writeFileSync(join(testRepoPath, "src", "ui.tsx"), "export const UI = () => <div/>;\n");
	await Bun.$`git -C ${testRepoPath} add src/ui.tsx`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Add UI component"`.quiet();

	headSha = (await Bun.$`git -C ${testRepoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();
});

afterAll(() => {
	if (testRepoPath) {
		rmSync(testRepoPath, { recursive: true, force: true });
	}
});

describe("executeStack", () => {
	test("creates commit chain with correct parent links", async () => {
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);
		const ownership = new Map([
			["src/auth.ts", "Auth"],
			["src/ui.tsx", "UI"],
		]);
		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth changes", files: ["src/auth.ts"] },
			{ name: "UI", type: "feature", description: "UI changes", files: ["src/ui.tsx"] },
		];

		const plan = await createStackPlan({
			repo_path: testRepoPath,
			base_sha: baseSha,
			head_sha: headSha,
			deltas,
			ownership,
			group_order: ["Auth", "UI"],
			groups,
		});

		const result = await executeStack({
			repo_path: testRepoPath,
			plan,
			deltas,
			ownership,
			pr_author: { name: "Test Author", email: "author@test.com" },
			pr_number: 42,
			head_branch: "feature-branch",
		});

		expect(result.group_commits.length).toBe(2);
		expect(result.source_copy_branch).toBe("newpr/stack-source/pr-42");

		const copyRef = await Bun.$`git -C ${testRepoPath} rev-parse refs/heads/newpr/stack-source/pr-42`.quiet().nothrow();
		expect(copyRef.exitCode).toBe(0);
		expect(copyRef.stdout.toString().trim()).toBe(headSha);

		const commit0 = result.group_commits[0];
		const commit1 = result.group_commits[1];

		expect(commit0?.group_id).toBe("Auth");
		expect(commit1?.group_id).toBe("UI");

		expect(commit0?.branch_name).toMatch(/^newpr-stack\/pr-42\/0-[a-z0-9]{6}$/);
		expect(commit1?.branch_name).toMatch(/^newpr-stack\/pr-42\/1-[a-z0-9]{6}$/);

		if (commit0) {
			const parent0 = (await Bun.$`git -C ${testRepoPath} rev-parse ${commit0.commit_sha}^`.quiet()).stdout.toString().trim();
			expect(parent0).toBe(baseSha);
		}

		if (commit0 && commit1) {
			const parent1 = (await Bun.$`git -C ${testRepoPath} rev-parse ${commit1.commit_sha}^`.quiet()).stdout.toString().trim();
			expect(parent1).toBe(commit0.commit_sha);
		}
	});

	test("final tree equals HEAD tree", async () => {
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);
		const ownership = new Map([
			["src/auth.ts", "Auth"],
			["src/ui.tsx", "UI"],
		]);
		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth", files: ["src/auth.ts"] },
			{ name: "UI", type: "feature", description: "UI", files: ["src/ui.tsx"] },
		];

		const plan = await createStackPlan({
			repo_path: testRepoPath,
			base_sha: baseSha,
			head_sha: headSha,
			deltas,
			ownership,
			group_order: ["Auth", "UI"],
			groups,
		});

		const result = await executeStack({
			repo_path: testRepoPath,
			plan,
			deltas,
			ownership,
			pr_author: { name: "Test", email: "t@t.com" },
			pr_number: 42,
			head_branch: "feature-branch",
		});

		const headTree = (await Bun.$`git -C ${testRepoPath} rev-parse ${headSha}^{tree}`.quiet()).stdout.toString().trim();
		expect(result.final_tree_sha).toBe(headTree);
	});

	test("branches are created in repo", async () => {
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);
		const ownership = new Map([
			["src/auth.ts", "Auth"],
			["src/ui.tsx", "UI"],
		]);
		const groups: FileGroup[] = [
			{ name: "Auth", type: "feature", description: "Auth", files: ["src/auth.ts"] },
			{ name: "UI", type: "feature", description: "UI", files: ["src/ui.tsx"] },
		];

		const plan = await createStackPlan({
			repo_path: testRepoPath,
			base_sha: baseSha,
			head_sha: headSha,
			deltas,
			ownership,
			group_order: ["Auth", "UI"],
			groups,
		});

		const result = await executeStack({
			repo_path: testRepoPath,
			plan,
			deltas,
			ownership,
			pr_author: { name: "Test", email: "t@t.com" },
			pr_number: 99,
			head_branch: "feature-branch",
		});

		for (const gc of result.group_commits) {
			const ref = await Bun.$`git -C ${testRepoPath} rev-parse refs/heads/${gc.branch_name}`.quiet().nothrow();
			expect(ref.exitCode).toBe(0);
			expect(ref.stdout.toString().trim()).toBe(gc.commit_sha);
		}
	});
});
