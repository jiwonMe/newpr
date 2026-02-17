import { test, expect, describe } from "bun:test";
import { parseDiff } from "../../src/diff/parser.ts";

const SIMPLE_MODIFY = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';
 
 function main() {`;

const NEW_FILE = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return true;
+}`;

const DELETED_FILE = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return false;
-}`;

const RENAMED_FILE = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 95%
rename from src/old-name.ts
rename to src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export function oldName() {
+export function newName() {
   return true;
 }`;

const BINARY_FILE = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abc1234
Binary files /dev/null and b/image.png differ`;

describe("parseDiff", () => {
	test("returns empty for empty input", () => {
		const result = parseDiff("");
		expect(result.files).toHaveLength(0);
		expect(result.total_additions).toBe(0);
		expect(result.total_deletions).toBe(0);
	});

	test("parses a simple modification", () => {
		const result = parseDiff(SIMPLE_MODIFY);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]!.path).toBe("src/main.ts");
		expect(result.files[0]!.status).toBe("modified");
		expect(result.files[0]!.additions).toBe(1);
		expect(result.files[0]!.deletions).toBe(0);
	});

	test("parses a new file", () => {
		const result = parseDiff(NEW_FILE);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]!.path).toBe("src/new.ts");
		expect(result.files[0]!.status).toBe("added");
		expect(result.files[0]!.additions).toBe(3);
	});

	test("parses a deleted file", () => {
		const result = parseDiff(DELETED_FILE);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]!.path).toBe("src/old.ts");
		expect(result.files[0]!.status).toBe("deleted");
		expect(result.files[0]!.deletions).toBe(3);
	});

	test("parses a renamed file", () => {
		const result = parseDiff(RENAMED_FILE);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]!.path).toBe("src/new-name.ts");
		expect(result.files[0]!.old_path).toBe("src/old-name.ts");
		expect(result.files[0]!.status).toBe("renamed");
		expect(result.files[0]!.additions).toBe(1);
		expect(result.files[0]!.deletions).toBe(1);
	});

	test("parses a binary file", () => {
		const result = parseDiff(BINARY_FILE);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]!.path).toBe("image.png");
		expect(result.files[0]!.is_binary).toBe(true);
		expect(result.files[0]!.additions).toBe(0);
	});

	test("parses multiple files and computes totals", () => {
		const combined = [SIMPLE_MODIFY, NEW_FILE, DELETED_FILE].join("\n");
		const result = parseDiff(combined);
		expect(result.files).toHaveLength(3);
		expect(result.total_additions).toBe(4);
		expect(result.total_deletions).toBe(3);
	});

	test("extracts hunk metadata", () => {
		const result = parseDiff(SIMPLE_MODIFY);
		const hunks = result.files[0]!.hunks;
		expect(hunks).toHaveLength(1);
		expect(hunks[0]!.old_start).toBe(1);
		expect(hunks[0]!.old_count).toBe(3);
		expect(hunks[0]!.new_start).toBe(1);
		expect(hunks[0]!.new_count).toBe(4);
	});
});
