import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrMeta } from "../types/output.ts";
import { buildStackPublishPreview } from "./publish.ts";
import type { StackExecResult } from "./types.ts";

let repoPath = "";
let headSha = "";

beforeAll(async () => {
	repoPath = mkdtempSync(join(tmpdir(), "publish-preview-test-"));

	await Bun.$`git init ${repoPath}`.quiet();
	await Bun.$`git -C ${repoPath} config user.name "Test User"`.quiet();
	await Bun.$`git -C ${repoPath} config user.email "test@example.com"`.quiet();

	writeFileSync(join(repoPath, "README.md"), "initial\n");
	await Bun.$`git -C ${repoPath} add README.md`.quiet();
	await Bun.$`git -C ${repoPath} commit -m "Initial commit"`.quiet();

	headSha = (await Bun.$`git -C ${repoPath} rev-parse HEAD`.quiet()).stdout.toString().trim();
});

afterAll(() => {
	if (repoPath) rmSync(repoPath, { recursive: true, force: true });
});

describe("buildStackPublishPreview", () => {
	test("uses DAG dependency bases instead of linear previous branch", async () => {
		const execResult: StackExecResult = {
			run_id: "run-1",
			source_copy_branch: "newpr/stack-source/pr-42",
			group_commits: [
				{ group_id: "A", commit_sha: headSha, tree_sha: headSha, branch_name: "stack/a", pr_title: "A title" },
				{ group_id: "B", commit_sha: headSha, tree_sha: headSha, branch_name: "stack/b", pr_title: "B title" },
				{ group_id: "C", commit_sha: headSha, tree_sha: headSha, branch_name: "stack/c", pr_title: "C title" },
			],
			final_tree_sha: headSha,
			verified: true,
		};

		const prMeta: PrMeta = {
			pr_number: 42,
			pr_title: "Source PR",
			pr_url: "https://github.com/acme/repo/pull/42",
			base_branch: "main",
			head_branch: "feature/source",
			author: "tester",
			total_files_changed: 3,
			total_additions: 10,
			total_deletions: 2,
			analyzed_at: new Date().toISOString(),
			model_used: "test-model",
		};

		const preview = await buildStackPublishPreview({
			repo_path: repoPath,
			exec_result: execResult,
			pr_meta: prMeta,
			base_branch: "main",
			owner: "acme",
			repo: "repo",
			plan_groups: [
				{ id: "A", name: "A", description: "A desc", files: ["a.ts"], order: 0, deps: [] },
				{ id: "B", name: "B", description: "B desc", files: ["b.ts"], order: 1, deps: ["A"] },
				{ id: "C", name: "C", description: "C desc", files: ["c.ts"], order: 2, deps: [] },
			],
		});

		const itemById = new Map(preview.items.map((item) => [item.group_id, item]));

		expect(itemById.get("A")?.base_branch).toBe("main");
		expect(itemById.get("B")?.base_branch).toBe("stack/a");
		expect(itemById.get("C")?.base_branch).toBe("main");

		expect(itemById.get("B")?.title).toContain("L1");
		expect(itemById.get("C")?.title).toContain("L0");
		expect(itemById.get("B")?.body).toContain("Stack L1");
		expect(itemById.get("C")?.body).toContain("Stack L0");
	});
});
