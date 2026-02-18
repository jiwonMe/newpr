import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStackPlan } from "./plan.ts";
import { executeStack } from "./execute.ts";
import { extractDeltas } from "./delta.ts";
import { verifyStack } from "./verify.ts";
import type { FileGroup } from "../types/output.ts";

let testRepoPath: string;
let baseSha: string;
let headSha: string;

beforeAll(async () => {
	testRepoPath = mkdtempSync(join(tmpdir(), "verify-test-"));

	await Bun.$`git init ${testRepoPath}`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.name "Test User"`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.email "test@example.com"`.quiet();

	writeFileSync(join(testRepoPath, "README.md"), "initial\n");
	await Bun.$`git -C ${testRepoPath} add README.md`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Initial"`.quiet();

	baseSha = (await Bun.$`git -C ${testRepoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();

	mkdirSync(join(testRepoPath, "src"), { recursive: true });
	writeFileSync(join(testRepoPath, "src", "auth.ts"), "export const auth = true;\n");
	await Bun.$`git -C ${testRepoPath} add src/auth.ts`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Add auth"`.quiet();

	writeFileSync(join(testRepoPath, "src", "ui.tsx"), "export const UI = () => <div/>;\n");
	await Bun.$`git -C ${testRepoPath} add src/ui.tsx`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Add UI"`.quiet();

	headSha = (await Bun.$`git -C ${testRepoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();
});

afterAll(() => {
	if (testRepoPath) rmSync(testRepoPath, { recursive: true, force: true });
});

describe("verifyStack", () => {
	test("valid stack passes all verification checks", async () => {
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

		const execResult = await executeStack({
			repo_path: testRepoPath,
			plan,
			deltas,
			ownership,
			pr_author: { name: "Test", email: "t@t.com" },
			pr_number: 1,
		});

		const verifyResult = await verifyStack({
			repo_path: testRepoPath,
			base_sha: baseSha,
			head_sha: headSha,
			exec_result: execResult,
			ownership,
		});

		expect(verifyResult.verified).toBe(true);
		expect(verifyResult.errors).toEqual([]);
	});

	test("detects tree mismatch when final_tree_sha is wrong", async () => {
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

		const execResult = await executeStack({
			repo_path: testRepoPath,
			plan,
			deltas,
			ownership,
			pr_author: { name: "Test", email: "t@t.com" },
			pr_number: 2,
		});

		const tamperedResult = {
			...execResult,
			final_tree_sha: "0".repeat(40),
		};

		const verifyResult = await verifyStack({
			repo_path: testRepoPath,
			base_sha: baseSha,
			head_sha: headSha,
			exec_result: tamperedResult,
			ownership,
		});

		expect(verifyResult.verified).toBe(false);
		expect(verifyResult.errors.some((e) => e.includes("Final tree mismatch"))).toBe(true);
	});
});
