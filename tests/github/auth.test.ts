import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { getGithubToken } from "../../src/github/auth.ts";

describe("getGithubToken", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.GITHUB_TOKEN;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test("returns GITHUB_TOKEN env var when set", async () => {
		process.env.GITHUB_TOKEN = "ghp_test123";
		const token = await getGithubToken();
		expect(token).toBe("ghp_test123");
	});

	test("prefers GITHUB_TOKEN over gh CLI", async () => {
		process.env.GITHUB_TOKEN = "ghp_env_token";
		const token = await getGithubToken();
		expect(token).toBe("ghp_env_token");
	});
});
