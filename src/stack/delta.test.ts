import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractDeltas, buildRenameMap, computeGroupStats, computeGroupStatsWithFiles } from "./delta.ts";
import { createStackPlan } from "./plan.ts";
import type { FileGroup } from "../types/output.ts";

let testRepoPath: string;

beforeAll(async () => {
	testRepoPath = mkdtempSync(join(tmpdir(), "delta-test-"));

	await Bun.$`git init ${testRepoPath}`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.name "Test User"`.quiet();
	await Bun.$`git -C ${testRepoPath} config user.email "test@example.com"`.quiet();

	await Bun.$`echo "initial" > ${join(testRepoPath, "README.md")}`.quiet();
	await Bun.$`git -C ${testRepoPath} add README.md`.quiet();
	await Bun.$`git -C ${testRepoPath} commit -m "Initial commit"`.quiet();
});

afterAll(() => {
	if (testRepoPath) {
		rmSync(testRepoPath, { recursive: true, force: true });
	}
});

describe("extractDeltas", () => {
	test("extracts A/M/D status correctly", async () => {
		const baseSha = await getCurrentSha(testRepoPath);

		await Bun.$`echo "new file" > ${join(testRepoPath, "new.txt")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add new.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Add new.txt"`.quiet();

		await Bun.$`echo "modified" > ${join(testRepoPath, "README.md")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add README.md`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Modify README"`.quiet();

		await Bun.$`git -C ${testRepoPath} rm new.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Delete new.txt"`.quiet();

		const headSha = await getCurrentSha(testRepoPath);
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);

		expect(deltas.length).toBe(3);

		const hasAdd = deltas.some((d) => d.changes.some((c) => c.status === "A" && c.path === "new.txt"));
		expect(hasAdd).toBe(true);

		const hasModify = deltas.some((d) => d.changes.some((c) => c.status === "M" && c.path === "README.md"));
		expect(hasModify).toBe(true);

		const hasDelete = deltas.some((d) => d.changes.some((c) => c.status === "D" && c.path === "new.txt"));
		expect(hasDelete).toBe(true);
	});

	test("extracts rename (R status) correctly", async () => {
		const baseSha = await getCurrentSha(testRepoPath);

		await Bun.$`echo "content" > ${join(testRepoPath, "old-name.txt")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add old-name.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Add old-name.txt"`.quiet();

		await Bun.$`git -C ${testRepoPath} mv old-name.txt new-name.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Rename file"`.quiet();

		const headSha = await getCurrentSha(testRepoPath);
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);

		const allRenames = deltas.flatMap((d) => d.changes.filter((c) => c.status === "R"));
		const renameChange = allRenames.find((c) => c.old_path === "old-name.txt");

		expect(renameChange).toBeDefined();
		expect(renameChange?.old_path).toBe("old-name.txt");
		expect(renameChange?.path).toBe("new-name.txt");
	});

	test("handles merge commits via first-parent linearization", async () => {
		const baseSha = await getCurrentSha(testRepoPath);

		await Bun.$`git -C ${testRepoPath} checkout -b feature`.quiet();
		await Bun.$`echo "feature" > ${join(testRepoPath, "feature.txt")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add feature.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Feature commit"`.quiet();

		await Bun.$`git -C ${testRepoPath} checkout main`.quiet();
		await Bun.$`echo "main" > ${join(testRepoPath, "main.txt")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add main.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Main commit"`.quiet();

		await Bun.$`git -C ${testRepoPath} merge feature --no-edit`.quiet();

		const headSha = await getCurrentSha(testRepoPath);

		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);
		expect(deltas.length).toBeGreaterThanOrEqual(2);
		const allPaths = deltas.flatMap((d) => d.changes.map((c) => c.path));
		expect(allPaths).toContain("main.txt");
		expect(allPaths).toContain("feature.txt");
	});

	test("includes commit metadata (author, date, message)", async () => {
		const baseSha = await getCurrentSha(testRepoPath);

		await Bun.$`echo "test" > ${join(testRepoPath, "test.txt")}`.quiet();
		await Bun.$`git -C ${testRepoPath} add test.txt`.quiet();
		await Bun.$`git -C ${testRepoPath} commit -m "Test commit message"`.quiet();

		const headSha = await getCurrentSha(testRepoPath);
		const deltas = await extractDeltas(testRepoPath, baseSha, headSha);

		expect(deltas.length).toBe(1);
		expect(deltas[0]?.author).toBe("Test User");
		expect(deltas[0]?.message).toBe("Test commit message");
		expect(deltas[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("computeGroupStats", () => {
	test("uses first dependency as baseline (matching publish base branch) for multi-parent DAG groups", async () => {
		const repoPath = mkdtempSync(join(tmpdir(), "group-stats-dag-test-"));
		try {
			await Bun.$`git init ${repoPath}`.quiet();
			await Bun.$`git -C ${repoPath} config user.name "Test User"`.quiet();
			await Bun.$`git -C ${repoPath} config user.email "test@example.com"`.quiet();

			await Bun.$`echo "a0" > ${join(repoPath, "a.txt")}`.quiet();
			await Bun.$`echo "b0" > ${join(repoPath, "b.txt")}`.quiet();
			await Bun.$`echo "c0" > ${join(repoPath, "c.txt")}`.quiet();
			await Bun.$`git -C ${repoPath} add -A`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "base"`.quiet();
			const baseSha = await getCurrentSha(repoPath);

			await Bun.$`echo "a1" > ${join(repoPath, "a.txt")}`.quiet();
			await Bun.$`git -C ${repoPath} add a.txt`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "A change"`.quiet();

			await Bun.$`echo "b1" > ${join(repoPath, "b.txt")}`.quiet();
			await Bun.$`git -C ${repoPath} add b.txt`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "B change"`.quiet();

			await Bun.$`echo "c1" > ${join(repoPath, "c.txt")}`.quiet();
			await Bun.$`git -C ${repoPath} add c.txt`.quiet();
			await Bun.$`git -C ${repoPath} commit -m "C change"`.quiet();
			const headSha = await getCurrentSha(repoPath);

			const deltas = await extractDeltas(repoPath, baseSha, headSha);
			const ownership = new Map([
				["a.txt", "A"],
				["b.txt", "B"],
				["c.txt", "C"],
			]);
			const groups: FileGroup[] = [
				{ name: "A", type: "feature", description: "A", files: ["a.txt"] },
				{ name: "B", type: "feature", description: "B", files: ["b.txt"] },
				{ name: "C", type: "feature", description: "C", files: ["c.txt"] },
			];

			const plan = await createStackPlan({
				repo_path: repoPath,
				base_sha: baseSha,
				head_sha: headSha,
				deltas,
				ownership,
				group_order: ["A", "B", "C"],
				groups,
				dependency_edges: [
					{ from: "A", to: "C" },
					{ from: "B", to: "C" },
				],
			});

			const dagParents = new Map(plan.groups.map((g) => [g.id, g.deps ?? []]));
			const stats = await computeGroupStats(repoPath, baseSha, ["A", "B", "C"], plan.expected_trees, dagParents);
			const detailed = await computeGroupStatsWithFiles(repoPath, baseSha, ["A", "B", "C"], plan.expected_trees, dagParents);

			expect(stats.get("A")?.additions).toBe(1);
			expect(stats.get("A")?.deletions).toBe(1);
			expect(stats.get("B")?.additions).toBe(1);
			expect(stats.get("B")?.deletions).toBe(1);
			expect(stats.get("C")?.additions).toBe(2);
			expect(stats.get("C")?.deletions).toBe(2);
			expect(detailed.get("A")?.file_stats["a.txt"]?.additions).toBe(1);
			expect(detailed.get("A")?.file_stats["a.txt"]?.deletions).toBe(1);
			expect(detailed.get("B")?.file_stats["b.txt"]?.additions).toBe(1);
			expect(detailed.get("B")?.file_stats["b.txt"]?.deletions).toBe(1);
			expect(detailed.get("C")?.file_stats["c.txt"]?.additions).toBe(1);
			expect(detailed.get("C")?.file_stats["c.txt"]?.deletions).toBe(1);
			expect(detailed.get("C")?.file_stats["b.txt"]?.additions).toBe(1);
			expect(detailed.get("C")?.file_stats["b.txt"]?.deletions).toBe(1);
		} finally {
			rmSync(repoPath, { recursive: true, force: true });
		}
	});
});

describe("buildRenameMap", () => {
	test("builds rename map from deltas", () => {
		const deltas = [
			{
				sha: "abc123",
				parent_sha: "def456",
				author: "Test",
				date: "2024-01-01",
				message: "Rename",
				changes: [
					{
						status: "R" as const,
						path: "new.txt",
						old_path: "old.txt",
						old_blob: "blob1",
						new_blob: "blob2",
						old_mode: "100644",
						new_mode: "100644",
					},
				],
			},
		];

		const renameMap = buildRenameMap(deltas);

		expect(renameMap.get("old.txt")).toBe("new.txt");
	});

	test("handles multiple renames", () => {
		const deltas = [
			{
				sha: "abc123",
				parent_sha: "def456",
				author: "Test",
				date: "2024-01-01",
				message: "Rename 1",
				changes: [
					{
						status: "R" as const,
						path: "b.txt",
						old_path: "a.txt",
						old_blob: "blob1",
						new_blob: "blob2",
						old_mode: "100644",
						new_mode: "100644",
					},
				],
			},
			{
				sha: "ghi789",
				parent_sha: "abc123",
				author: "Test",
				date: "2024-01-02",
				message: "Rename 2",
				changes: [
					{
						status: "R" as const,
						path: "c.txt",
						old_path: "b.txt",
						old_blob: "blob2",
						new_blob: "blob3",
						old_mode: "100644",
						new_mode: "100644",
					},
				],
			},
		];

		const renameMap = buildRenameMap(deltas);

		expect(renameMap.get("a.txt")).toBe("b.txt");
		expect(renameMap.get("b.txt")).toBe("c.txt");
	});

	test("returns empty map for no renames", () => {
		const deltas = [
			{
				sha: "abc123",
				parent_sha: "def456",
				author: "Test",
				date: "2024-01-01",
				message: "Add file",
				changes: [
					{
						status: "A" as const,
						path: "new.txt",
						old_blob: "0000000000000000000000000000000000000000",
						new_blob: "blob1",
						old_mode: "000000",
						new_mode: "100644",
					},
				],
			},
		];

		const renameMap = buildRenameMap(deltas);

		expect(renameMap.size).toBe(0);
	});
});

async function getCurrentSha(repoPath: string): Promise<string> {
	const result = await Bun.$`git -C ${repoPath} rev-parse HEAD`.quiet();
	return result.stdout.toString().trim();
}
