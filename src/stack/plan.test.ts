import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStackPlan } from "./plan.ts";
import { extractDeltas } from "./delta.ts";
import type { FileGroup } from "../types/output.ts";

let testRepoPath: string;
let baseSha: string;
let headSha: string;

beforeAll(async () => {
	testRepoPath = mkdtempSync(join(tmpdir(), "plan-test-"));

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

	writeFileSync(join(testRepoPath, "src", "auth.ts"), "export const auth = true;\nexport const token = 'abc';\n");
	await Bun.$`git -C ${testRepoPath} add src/auth.ts`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Update auth with token"`.quiet();

	headSha = (await Bun.$`git -C ${testRepoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();
});

afterAll(() => {
	if (testRepoPath) {
		rmSync(testRepoPath, { recursive: true, force: true });
	}
});

describe("createStackPlan", () => {
	test("creates plan with expected trees for 2 groups", async () => {
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

		expect(plan.groups.length).toBe(2);
		expect(plan.expected_trees.size).toBe(2);
		expect(plan.expected_trees.get("Auth")).toBeDefined();
		expect(plan.expected_trees.get("UI")).toBeDefined();

		expect(plan.groups[0]?.id).toBe("Auth");
		expect(plan.groups[0]?.files).toContain("src/auth.ts");
		expect(plan.groups[1]?.id).toBe("UI");
		expect(plan.groups[1]?.files).toContain("src/ui.tsx");
	});

	test("final tree matches HEAD tree (suffix propagation)", async () => {
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

		const headTreeResult = await Bun.$`git -C ${testRepoPath} rev-parse ${headSha}^{tree}`.quiet();
		const headTree = headTreeResult.stdout.toString().trim();

		const lastGroupId = "UI";
		const lastExpectedTree = plan.expected_trees.get(lastGroupId);

		expect(lastExpectedTree).toBe(headTree);
	});

	test("plan with file deletion", async () => {
		const repoPath = mkdtempSync(join(tmpdir(), "plan-delete-test-"));
		try {
			await Bun.$`git init ${repoPath}`.quiet();
			await Bun.$`git -C ${repoPath} config user.name "Test"`.quiet();
			await Bun.$`git -C ${repoPath} config user.email "t@t.com"`.quiet();

			writeFileSync(join(repoPath, "a.ts"), "a\n");
			writeFileSync(join(repoPath, "b.ts"), "b\n");
			await Bun.$`git -C ${repoPath} add -A`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "Init"`.quiet();
			const base = (await Bun.$`git -C ${repoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();

			await Bun.$`git -C ${repoPath} rm b.ts`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "Delete b.ts"`.quiet();
			const head = (await Bun.$`git -C ${repoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();

			const deltas = await extractDeltas(repoPath, base, head);
			const ownership = new Map([["b.ts", "Cleanup"]]);
			const groups: FileGroup[] = [
				{ name: "Cleanup", type: "chore", description: "Remove unused", files: ["b.ts"] },
			];

			const plan = await createStackPlan({
				repo_path: repoPath,
				base_sha: base,
				head_sha: head,
				deltas,
				ownership,
				group_order: ["Cleanup"],
				groups,
			});

			const headTree = (await Bun.$`git -C ${repoPath} rev-parse ${head}^{tree}`.quiet()).stdout.toString().trim();
			expect(plan.expected_trees.get("Cleanup")).toBe(headTree);
		} finally {
			rmSync(repoPath, { recursive: true, force: true });
		}
	});
});
