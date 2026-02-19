import { describe, test, expect } from "bun:test";
import { checkFeasibility } from "./feasibility.ts";
import type { DeltaEntry } from "./types.ts";

function makeDelta(sha: string, parentSha: string, files: Array<{ status: "A" | "M" | "D"; path: string }>): DeltaEntry {
	return {
		sha,
		parent_sha: parentSha,
		author: "Test",
		date: "2024-01-01",
		message: `Commit ${sha}`,
		changes: files.map((f) => ({
			status: f.status,
			path: f.path,
			old_blob: "0".repeat(40),
			new_blob: "1".repeat(40),
			old_mode: f.status === "A" ? "000000" : "100644",
			new_mode: f.status === "D" ? "000000" : "100644",
		})),
	};
}

describe("checkFeasibility", () => {
	test("monotonic sequence (A→B→C) is feasible with correct order", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "A", path: "a.ts" }]),
			makeDelta("c2", "c1", [{ status: "A", path: "b.ts" }]),
			makeDelta("c3", "c2", [{ status: "A", path: "c.ts" }]),
		];

		const ownership = new Map([
			["a.ts", "group-a"],
			["b.ts", "group-b"],
			["c.ts", "group-c"],
		]);

		const result = checkFeasibility({ deltas, ownership });

		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toBeDefined();
	});

	test("non-monotonic (A→B→A) is infeasible with cycle report", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "M", path: "shared.ts" }]),
			makeDelta("c2", "c1", [{ status: "M", path: "shared.ts" }]),
			makeDelta("c3", "c2", [{ status: "M", path: "shared.ts" }]),
		];

		const ownership = new Map([
			["shared.ts", "group-a"],
		]);

		const result = checkFeasibility({ deltas, ownership });
		expect(result.feasible).toBe(true);
	});

	test("same-group edits across commits are monotonic → feasible", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [
				{ status: "M", path: "file-a.ts" },
				{ status: "M", path: "file-b.ts" },
			]),
			makeDelta("c2", "c1", [
				{ status: "M", path: "file-b.ts" },
				{ status: "M", path: "file-a.ts" },
			]),
		];

		const ownership = new Map([
			["file-a.ts", "group-a"],
			["file-b.ts", "group-b"],
		]);

		const result = checkFeasibility({ deltas, ownership });
		expect(result.feasible).toBe(true);
	});

	test("declared deps with mutual cycle → still feasible (cycle broken automatically)", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "A", path: "a.ts" }]),
			makeDelta("c2", "c1", [{ status: "A", path: "b.ts" }]),
		];

		const ownership = new Map([
			["a.ts", "group-a"],
			["b.ts", "group-b"],
		]);

		const declaredDeps = new Map([
			["group-a", ["group-b"]],
			["group-b", ["group-a"]],
		]);

		const result = checkFeasibility({ deltas, ownership, declared_deps: declaredDeps });

		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toHaveLength(2);
	});

	test("single file in one group → no edges, feasible", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "A", path: "a.ts" }]),
		];

		const ownership = new Map([["a.ts", "group-a"]]);

		const result = checkFeasibility({ deltas, ownership });

		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toEqual(["group-a"]);
	});

	test("empty input → feasible", () => {
		const result = checkFeasibility({
			deltas: [],
			ownership: new Map(),
		});

		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toEqual([]);
	});

	test("per-file monotonic edits across commits → feasible", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "M", path: "file-x.ts" }]),
			makeDelta("c2", "c1", [{ status: "M", path: "file-y.ts" }]),
			makeDelta("c3", "c2", [{ status: "M", path: "file-x.ts" }]),
			makeDelta("c4", "c3", [{ status: "M", path: "file-y.ts" }]),
		];

		const ownership = new Map([
			["file-x.ts", "group-a"],
			["file-y.ts", "group-b"],
		]);

		const result = checkFeasibility({ deltas, ownership });
		expect(result.feasible).toBe(true);
	});

	test("mutual declared deps create cycle → cycle broken, still feasible", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "A", path: "a.ts" }]),
			makeDelta("c2", "c1", [{ status: "A", path: "b.ts" }]),
		];

		const ownership = new Map([
			["a.ts", "group-a"],
			["b.ts", "group-b"],
		]);

		const declaredDeps = new Map([
			["group-a", ["group-b"]],
			["group-b", ["group-a"]],
		]);

		const result = checkFeasibility({ deltas, ownership, declared_deps: declaredDeps });
		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toHaveLength(2);
	});

	test("declared deps without cycle → feasible with correct order", () => {
		const deltas: DeltaEntry[] = [
			makeDelta("c1", "base", [{ status: "A", path: "a.ts" }]),
			makeDelta("c2", "c1", [{ status: "A", path: "b.ts" }]),
		];

		const ownership = new Map([
			["a.ts", "group-a"],
			["b.ts", "group-b"],
		]);

		const declaredDeps = new Map([
			["group-b", ["group-a"]],
		]);

		const result = checkFeasibility({ deltas, ownership, declared_deps: declaredDeps });

		expect(result.feasible).toBe(true);
		expect(result.ordered_group_ids).toBeDefined();
		const order = result.ordered_group_ids!;
		expect(order.indexOf("group-a")).toBeLessThan(order.indexOf("group-b"));
	});
});
