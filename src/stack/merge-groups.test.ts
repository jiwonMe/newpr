import { describe, test, expect } from "bun:test";
import { mergeGroups } from "./merge-groups.ts";
import type { FileGroup } from "../types/output.ts";

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
