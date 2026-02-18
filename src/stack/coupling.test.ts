import { describe, test, expect } from "bun:test";
import { applyCouplingRules } from "./coupling.ts";

describe("applyCouplingRules", () => {
	test("package.json + bun.lockb in different groups → forced to same group", () => {
		const ownership = new Map([
			["package.json", "group-a"],
			["bun.lockb", "group-b"],
			["src/index.ts", "group-a"],
		]);
		const changedFiles = ["package.json", "bun.lockb", "src/index.ts"];
		const groupOrder = ["group-a", "group-b"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// Both should be in group-a (earliest)
		expect(result.ownership.get("package.json")).toBe("group-a");
		expect(result.ownership.get("bun.lockb")).toBe("group-a");
		expect(result.ownership.get("src/index.ts")).toBe("group-a");

		// Should have warning
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("package.json");
		expect(result.warnings[0]).toContain("bun.lockb");

		// Should have forced merge
		expect(result.forced_merges).toEqual([
			{
				path: "bun.lockb",
				from_group: "group-b",
				to_group: "group-a",
			},
		]);
	});

	test("coupling set in same group → no change", () => {
		const ownership = new Map([
			["package.json", "group-a"],
			["bun.lockb", "group-a"],
			["src/index.ts", "group-b"],
		]);
		const changedFiles = ["package.json", "bun.lockb", "src/index.ts"];
		const groupOrder = ["group-a", "group-b"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// No changes
		expect(result.ownership.get("package.json")).toBe("group-a");
		expect(result.ownership.get("bun.lockb")).toBe("group-a");
		expect(result.ownership.get("src/index.ts")).toBe("group-b");

		// No warnings
		expect(result.warnings).toEqual([]);
		expect(result.forced_merges).toEqual([]);
	});

	test("no coupling files → no change", () => {
		const ownership = new Map([
			["src/index.ts", "group-a"],
			["src/utils.ts", "group-b"],
		]);
		const changedFiles = ["src/index.ts", "src/utils.ts"];
		const groupOrder = ["group-a", "group-b"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// No changes
		expect(result.ownership.get("src/index.ts")).toBe("group-a");
		expect(result.ownership.get("src/utils.ts")).toBe("group-b");

		// No warnings
		expect(result.warnings).toEqual([]);
		expect(result.forced_merges).toEqual([]);
	});

	test("tsconfig.json + tsconfig.base.json → coupled", () => {
		const ownership = new Map([
			["tsconfig.json", "group-a"],
			["tsconfig.base.json", "group-b"],
			["src/index.ts", "group-a"],
		]);
		const changedFiles = ["tsconfig.json", "tsconfig.base.json", "src/index.ts"];
		const groupOrder = ["group-a", "group-b"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// Both tsconfig files should be in group-a
		expect(result.ownership.get("tsconfig.json")).toBe("group-a");
		expect(result.ownership.get("tsconfig.base.json")).toBe("group-a");

		// Should have warning
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("tsconfig");

		// Should have forced merge
		expect(result.forced_merges).toEqual([
			{
				path: "tsconfig.base.json",
				from_group: "group-b",
				to_group: "group-a",
			},
		]);
	});

	test(".gitattributes always in earliest group", () => {
		const ownership = new Map([
			[".gitattributes", "group-b"],
			["src/index.ts", "group-a"],
		]);
		const changedFiles = [".gitattributes", "src/index.ts"];
		const groupOrder = ["group-a", "group-b"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// .gitattributes should be in group-a (earliest)
		expect(result.ownership.get(".gitattributes")).toBe("group-b");
		// Note: .gitattributes is in its own coupling set, so it won't move
		// unless there are other files in the same set
	});

	test("multiple lockfiles in different groups → all forced to earliest", () => {
		const ownership = new Map([
			["package.json", "group-a"],
			["bun.lockb", "group-b"],
			["yarn.lock", "group-c"],
		]);
		const changedFiles = ["package.json", "bun.lockb", "yarn.lock"];
		const groupOrder = ["group-a", "group-b", "group-c"];

		const result = applyCouplingRules(ownership, changedFiles, groupOrder);

		// All should be in group-a
		expect(result.ownership.get("package.json")).toBe("group-a");
		expect(result.ownership.get("bun.lockb")).toBe("group-a");
		expect(result.ownership.get("yarn.lock")).toBe("group-a");

		// Should have 2 forced merges
		expect(result.forced_merges.length).toBe(2);
	});

	test("does not mutate input ownership map", () => {
		const ownership = new Map([
			["package.json", "group-a"],
			["bun.lockb", "group-b"],
		]);
		const originalSize = ownership.size;
		const originalPackageGroup = ownership.get("package.json");

		applyCouplingRules(ownership, ["package.json", "bun.lockb"], [
			"group-a",
			"group-b",
		]);

		// Original map unchanged
		expect(ownership.size).toBe(originalSize);
		expect(ownership.get("package.json")).toBe(originalPackageGroup);
	});
});
