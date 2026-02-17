import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const TEST_DIR = join(import.meta.dir, ".test-history");

function createTestStore() {
	const histDir = TEST_DIR;

	return {
		async save(record: {
			id: string;
			pr_url: string;
			pr_number: number;
			pr_title: string;
			repo: string;
			author: string;
			analyzed_at: string;
			risk_level: string;
			total_files: number;
			total_additions: number;
			total_deletions: number;
			summary_purpose: string;
			data_path: string;
		}) {
			mkdirSync(histDir, { recursive: true });
			const indexPath = join(histDir, "index.json");
			let index: typeof record[] = [];
			try {
				const file = Bun.file(indexPath);
				if (await file.exists()) {
					index = JSON.parse(await file.text());
				}
			} catch {
				index = [];
			}
			index = [record, ...index.filter((r) => r.id !== record.id)];
			await Bun.write(indexPath, JSON.stringify(index, null, 2));
		},

		async list(limit = 20): Promise<Array<{
			id: string;
			pr_url: string;
			pr_number: number;
			pr_title: string;
			repo: string;
			analyzed_at: string;
			risk_level: string;
		}>> {
			const indexPath = join(histDir, "index.json");
			try {
				const file = Bun.file(indexPath);
				if (!(await file.exists())) return [];
				const index = JSON.parse(await file.text());
				return index.slice(0, limit);
			} catch {
				return [];
			}
		},

		async saveData(id: string, data: unknown) {
			mkdirSync(join(histDir, "sessions"), { recursive: true });
			const filePath = join(histDir, "sessions", `${id}.json`);
			await Bun.write(filePath, JSON.stringify(data, null, 2));
			return filePath;
		},

		async loadData(id: string) {
			const filePath = join(histDir, "sessions", `${id}.json`);
			const file = Bun.file(filePath);
			if (!(await file.exists())) return null;
			return JSON.parse(await file.text());
		},

		async clear() {
			if (existsSync(histDir)) rmSync(histDir, { recursive: true });
		},
	};
}

describe("history store", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
	});

	test("list returns empty when no history", async () => {
		const store = createTestStore();
		const items = await store.list();
		expect(items).toEqual([]);
	});

	test("save and list a session record", async () => {
		const store = createTestStore();
		await store.save({
			id: "abc123",
			pr_url: "https://github.com/o/r/pull/1",
			pr_number: 1,
			pr_title: "Test PR",
			repo: "o/r",
			author: "dev",
			analyzed_at: "2025-01-01T00:00:00Z",
			risk_level: "low",
			total_files: 5,
			total_additions: 100,
			total_deletions: 20,
			summary_purpose: "Add feature",
			data_path: "sessions/abc123.json",
		});

		const items = await store.list();
		expect(items).toHaveLength(1);
		expect(items[0]!.id).toBe("abc123");
		expect(items[0]!.pr_title).toBe("Test PR");
	});

	test("most recent entry is first", async () => {
		const store = createTestStore();
		await store.save({
			id: "first",
			pr_url: "u1", pr_number: 1, pr_title: "First", repo: "o/r",
			author: "a", analyzed_at: "2025-01-01T00:00:00Z", risk_level: "low",
			total_files: 1, total_additions: 1, total_deletions: 0,
			summary_purpose: "p", data_path: "sessions/first.json",
		});
		await store.save({
			id: "second",
			pr_url: "u2", pr_number: 2, pr_title: "Second", repo: "o/r",
			author: "a", analyzed_at: "2025-01-02T00:00:00Z", risk_level: "medium",
			total_files: 2, total_additions: 10, total_deletions: 5,
			summary_purpose: "p", data_path: "sessions/second.json",
		});

		const items = await store.list();
		expect(items).toHaveLength(2);
		expect(items[0]!.id).toBe("second");
		expect(items[1]!.id).toBe("first");
	});

	test("re-saving same id updates instead of duplicating", async () => {
		const store = createTestStore();
		const base = {
			id: "dup",
			pr_url: "u", pr_number: 1, pr_title: "Old", repo: "o/r",
			author: "a", analyzed_at: "2025-01-01T00:00:00Z", risk_level: "low",
			total_files: 1, total_additions: 1, total_deletions: 0,
			summary_purpose: "p", data_path: "sessions/dup.json",
		};
		await store.save(base);
		await store.save({ ...base, pr_title: "Updated" });

		const items = await store.list();
		expect(items).toHaveLength(1);
		expect(items[0]!.pr_title).toBe("Updated");
	});

	test("save and load full analysis data", async () => {
		const store = createTestStore();
		const mockData = { meta: { pr_number: 42 }, summary: { purpose: "test" } };
		const path = await store.saveData("sess1", mockData);
		expect(path).toContain("sess1.json");

		const loaded = await store.loadData("sess1");
		expect(loaded.meta.pr_number).toBe(42);
	});

	test("loadData returns null for missing session", async () => {
		const store = createTestStore();
		const result = await store.loadData("nonexistent");
		expect(result).toBeNull();
	});

	test("list respects limit", async () => {
		const store = createTestStore();
		for (let i = 0; i < 5; i++) {
			await store.save({
				id: `s${i}`, pr_url: `u${i}`, pr_number: i, pr_title: `PR ${i}`, repo: "o/r",
				author: "a", analyzed_at: `2025-01-0${i + 1}T00:00:00Z`, risk_level: "low",
				total_files: 1, total_additions: 1, total_deletions: 0,
				summary_purpose: "p", data_path: `sessions/s${i}.json`,
			});
		}

		const items = await store.list(3);
		expect(items).toHaveLength(3);
	});

	test("clear removes all history", async () => {
		const store = createTestStore();
		await store.save({
			id: "x", pr_url: "u", pr_number: 1, pr_title: "X", repo: "o/r",
			author: "a", analyzed_at: "2025-01-01T00:00:00Z", risk_level: "low",
			total_files: 1, total_additions: 1, total_deletions: 0,
			summary_purpose: "p", data_path: "sessions/x.json",
		});
		await store.clear();
		const items = await store.list();
		expect(items).toEqual([]);
	});
});
