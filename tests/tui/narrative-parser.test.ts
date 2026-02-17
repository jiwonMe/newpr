import { test, expect, describe } from "bun:test";
import { parseNarrativeAnchors, buildWalkthrough } from "../../src/tui/narrative-parser.ts";
import type { FileGroup, FileChange } from "../../src/types/output.ts";

describe("parseNarrativeAnchors", () => {
	test("extracts group anchors from narrative text", () => {
		const narrative = "The [[group:Auth Flow]] group adds authentication.";
		const result = parseNarrativeAnchors(narrative);

		expect(result.allAnchors).toHaveLength(1);
		expect(result.allAnchors[0]!.kind).toBe("group");
		expect(result.allAnchors[0]!.id).toBe("Auth Flow");
		expect(result.displayLines[0]).toBe("The Auth Flow group adds authentication.");
	});

	test("extracts file anchors, displaying only filename", () => {
		const narrative = "Changes in [[file:src/auth/session.ts]] handle tokens.";
		const result = parseNarrativeAnchors(narrative);

		expect(result.allAnchors).toHaveLength(1);
		expect(result.allAnchors[0]!.kind).toBe("file");
		expect(result.allAnchors[0]!.id).toBe("src/auth/session.ts");
		expect(result.displayLines[0]).toBe("Changes in session.ts handle tokens.");
	});

	test("handles multiple anchors on one line", () => {
		const narrative = "The [[group:API]] updates [[file:src/routes.ts]] and [[file:src/handler.ts]].";
		const result = parseNarrativeAnchors(narrative);

		expect(result.allAnchors).toHaveLength(3);
		expect(result.allAnchors[0]!.kind).toBe("group");
		expect(result.allAnchors[1]!.kind).toBe("file");
		expect(result.allAnchors[2]!.kind).toBe("file");
	});

	test("handles narrative with no anchors", () => {
		const narrative = "This is a plain narrative.\nWith two lines.";
		const result = parseNarrativeAnchors(narrative);

		expect(result.allAnchors).toHaveLength(0);
		expect(result.displayLines).toHaveLength(2);
	});

	test("builds blocks split by empty lines and headings", () => {
		const narrative = `## Overview

The [[group:Core]] changes add new features.

## Details

The [[file:src/main.ts]] file is the entry point.`;

		const result = parseNarrativeAnchors(narrative);

		expect(result.blocks.length).toBeGreaterThanOrEqual(4);
		const anchorsInBlocks = result.blocks.flatMap((b) => b.anchors);
		expect(anchorsInBlocks).toHaveLength(2);
	});

	test("tracks correct column positions for anchors", () => {
		const narrative = "Before [[group:Test]] after";
		const result = parseNarrativeAnchors(narrative);

		const anchor = result.allAnchors[0]!;
		expect(anchor.startCol).toBe(7);
		expect(anchor.endCol).toBe(11);
		expect(result.displayLines[0]!.slice(anchor.startCol, anchor.endCol)).toBe("Test");
	});
});

describe("buildWalkthrough", () => {
	const groups: FileGroup[] = [
		{ name: "Auth", type: "feature", description: "Authentication", files: ["src/auth.ts"] },
		{ name: "API", type: "refactor", description: "API routes", files: ["src/api.ts", "src/routes.ts"] },
	];

	const files: FileChange[] = [
		{ path: "src/auth.ts", status: "added", additions: 10, deletions: 0, summary: "Auth module", groups: ["Auth"] },
		{ path: "src/api.ts", status: "modified", additions: 5, deletions: 3, summary: "API changes", groups: ["API"] },
		{ path: "src/routes.ts", status: "modified", additions: 8, deletions: 2, summary: "Route updates", groups: ["API"] },
	];

	test("builds steps with related groups and files", () => {
		const narrative = `The [[group:Auth]] group adds login.

The [[group:API]] group refactors [[file:src/api.ts]].`;

		const parsed = parseNarrativeAnchors(narrative);
		const steps = buildWalkthrough(parsed, groups, files);

		expect(steps.length).toBeGreaterThanOrEqual(2);

		const authStep = steps.find((s) => s.relatedGroups.some((g) => g.name === "Auth"));
		expect(authStep).toBeDefined();
		expect(authStep!.relatedFiles).toHaveLength(1);
		expect(authStep!.relatedFiles[0]!.path).toBe("src/auth.ts");

		const apiStep = steps.find((s) => s.relatedGroups.some((g) => g.name === "API"));
		expect(apiStep).toBeDefined();
		expect(apiStep!.relatedFiles.length).toBeGreaterThanOrEqual(2);
	});

	test("handles blocks with no anchors", () => {
		const narrative = "This is a plain introduction.";
		const parsed = parseNarrativeAnchors(narrative);
		const steps = buildWalkthrough(parsed, groups, files);

		expect(steps).toHaveLength(1);
		expect(steps[0]!.relatedGroups).toHaveLength(0);
		expect(steps[0]!.relatedFiles).toHaveLength(0);
	});
});
