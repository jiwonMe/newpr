import { describe, test, expect } from "bun:test";
import { mergeGroups, mergeEmptyGroups } from "./merge-groups.ts";
import type { FileGroup } from "../types/output.ts";
import type { StackGroup, StackGroupStats } from "./types.ts";

describe("mergeGroups", () => {
	test("no-op when already at or below target", () => {
		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a.ts"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"] },
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);

		const result = mergeGroups(groups, ownership, 3);
		expect(result.groups.length).toBe(2);
		expect(result.merges).toEqual([]);
	});

	test("merges 4 groups down to 2", () => {
		const groups: FileGroup[] = [
			{ name: "Big", type: "feature", description: "Big", files: ["a.ts", "b.ts", "c.ts"] },
			{ name: "Small1", type: "feature", description: "Small1", files: ["d.ts"] },
			{ name: "Small2", type: "feature", description: "Small2", files: ["e.ts"] },
			{ name: "Medium", type: "feature", description: "Medium", files: ["f.ts", "g.ts"] },
		];
		const ownership = new Map([
			["a.ts", "Big"], ["b.ts", "Big"], ["c.ts", "Big"],
			["d.ts", "Small1"], ["e.ts", "Small2"],
			["f.ts", "Medium"], ["g.ts", "Medium"],
		]);

		const result = mergeGroups(groups, ownership, 2);
		expect(result.groups.length).toBe(2);
		expect(result.merges.length).toBe(2);

		const allFiles = result.groups.flatMap((g) => g.files);
		expect(allFiles.sort()).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"]);

		for (const [path] of ownership) {
			expect(result.ownership.has(path)).toBe(true);
			const owner = result.ownership.get(path)!;
			expect(result.groups.some((g) => g.name === owner)).toBe(true);
		}
	});

	test("ownership updated for absorbed group files", () => {
		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a1.ts", "a2.ts"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"] },
		];
		const ownership = new Map([
			["a1.ts", "A"], ["a2.ts", "A"], ["b.ts", "B"],
		]);

		const result = mergeGroups(groups, ownership, 1);
		expect(result.groups.length).toBe(1);

		const survivorName = result.groups[0]!.name;
		expect(result.ownership.get("a1.ts")).toBe(survivorName);
		expect(result.ownership.get("a2.ts")).toBe(survivorName);
		expect(result.ownership.get("b.ts")).toBe(survivorName);
	});

	test("targetCount 0 or negative returns single group", () => {
		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a.ts"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"] },
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);

		const result = mergeGroups(groups, ownership, 0);
		expect(result.groups.length).toBe(2);
		expect(result.merges).toEqual([]);
	});

	test("single group unchanged", () => {
		const groups: FileGroup[] = [
			{ name: "Only", type: "feature", description: "Only", files: ["a.ts", "b.ts"] },
		];
		const ownership = new Map([["a.ts", "Only"], ["b.ts", "Only"]]);

		const result = mergeGroups(groups, ownership, 1);
		expect(result.groups.length).toBe(1);
		expect(result.merges).toEqual([]);
	});

	test("preserves key_changes from absorbed group", () => {
		const groups: FileGroup[] = [
			{ name: "A", type: "feature", description: "A", files: ["a.ts"], key_changes: ["Added auth"] },
			{ name: "B", type: "feature", description: "B", files: ["b.ts"], key_changes: ["Added UI"] },
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);

		const result = mergeGroups(groups, ownership, 1);
		expect(result.groups[0]!.key_changes).toContain("Added auth");
		expect(result.groups[0]!.key_changes).toContain("Added UI");
	});
});

function makeStackGroup(overrides: Partial<StackGroup> & { id: string; name: string }): StackGroup {
	return {
		type: "feature",
		description: "",
		files: [],
		deps: [],
		order: 0,
		...overrides,
	};
}

const zeroStats: StackGroupStats = { additions: 0, deletions: 0, files_added: 0, files_modified: 0, files_deleted: 0 };
const nonZeroStats: StackGroupStats = { additions: 10, deletions: 5, files_added: 1, files_modified: 1, files_deleted: 0 };

describe("mergeEmptyGroups", () => {
	test("no-op when no empty groups", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: nonZeroStats }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: nonZeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(2);
		expect(result.merges).toEqual([]);
	});

	test("merges empty group into next neighbor", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: zeroStats }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: nonZeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(1);
		expect(result.groups[0]!.id).toBe("B");
		expect(result.groups[0]!.files).toContain("a.ts");
		expect(result.groups[0]!.files).toContain("b.ts");
		expect(result.ownership.get("a.ts")).toBe("B");
		expect(result.expectedTrees.has("A")).toBe(false);
		expect(result.expectedTrees.has("B")).toBe(true);
		expect(result.merges).toEqual([{ absorbed: "A", into: "B" }]);
	});

	test("merges last empty group into previous neighbor", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: nonZeroStats }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: zeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(1);
		expect(result.groups[0]!.id).toBe("A");
		expect(result.groups[0]!.files).toContain("b.ts");
		expect(result.ownership.get("b.ts")).toBe("A");
	});

	test("merges multiple empty groups", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: zeroStats }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: nonZeroStats }),
			makeStackGroup({ id: "C", name: "C", files: ["c.ts"], order: 2, stats: zeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"], ["c.ts", "C"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"], ["C", "tree-c"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(1);
		expect(result.groups[0]!.id).toBe("B");
		expect(result.groups[0]!.files).toContain("a.ts");
		expect(result.groups[0]!.files).toContain("b.ts");
		expect(result.groups[0]!.files).toContain("c.ts");
		expect(result.merges.length).toBe(2);
	});

	test("single group is never merged even if empty", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: zeroStats }),
		];
		const ownership = new Map([["a.ts", "A"]]);
		const trees = new Map([["A", "tree-a"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(1);
		expect(result.merges).toEqual([]);
	});

	test("groups without stats are not considered empty", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0 }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: nonZeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(2);
		expect(result.merges).toEqual([]);
	});

	test("order is recalculated after merges", () => {
		const groups: StackGroup[] = [
			makeStackGroup({ id: "A", name: "A", files: ["a.ts"], order: 0, stats: zeroStats }),
			makeStackGroup({ id: "B", name: "B", files: ["b.ts"], order: 1, stats: nonZeroStats }),
			makeStackGroup({ id: "C", name: "C", files: ["c.ts"], order: 2, stats: nonZeroStats }),
		];
		const ownership = new Map([["a.ts", "A"], ["b.ts", "B"], ["c.ts", "C"]]);
		const trees = new Map([["A", "tree-a"], ["B", "tree-b"], ["C", "tree-c"]]);

		const result = mergeEmptyGroups(groups, ownership, trees);
		expect(result.groups.length).toBe(2);
		expect(result.groups[0]!.order).toBe(0);
		expect(result.groups[1]!.order).toBe(1);
	});
});
