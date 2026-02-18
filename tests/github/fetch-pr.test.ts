import { test, expect, describe } from "bun:test";
import { mapPrResponse } from "../../src/github/fetch-pr.ts";

describe("mapPrResponse", () => {
	test("maps a full GitHub API response", () => {
		const json = {
			number: 42,
			title: "Add feature X",
			body: "This PR adds feature X",
			html_url: "https://github.com/owner/repo/pull/42",
			user: { login: "developer" },
			base: { ref: "main" },
			head: { ref: "feature/x" },
			additions: 100,
			deletions: 50,
			changed_files: 10,
		};

		const result = mapPrResponse(json);

		expect(result).toEqual({
			number: 42,
			title: "Add feature X",
			body: "This PR adds feature X",
			url: "https://github.com/owner/repo/pull/42",
			state: "open",
			base_branch: "main",
			head_branch: "feature/x",
			author: "developer",
			additions: 100,
			deletions: 50,
			changed_files: 10,
		});
	});

	test("handles missing nested fields with defaults", () => {
		const json = {
			number: 1,
			title: "Test",
			html_url: "https://github.com/a/b/pull/1",
		};

		const result = mapPrResponse(json);

		expect(result.state).toBe("open");
		expect(result.author).toBe("unknown");
		expect(result.body).toBe("");
		expect(result.base_branch).toBe("unknown");
		expect(result.head_branch).toBe("unknown");
		expect(result.additions).toBe(0);
		expect(result.deletions).toBe(0);
		expect(result.changed_files).toBe(0);
	});
});
