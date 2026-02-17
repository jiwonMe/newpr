import { test, expect, describe } from "bun:test";
import { INSTALL_INSTRUCTIONS } from "../../src/workspace/types.ts";

describe("agent types", () => {
	test("install instructions exist for all agent tools", () => {
		expect(INSTALL_INSTRUCTIONS.claude).toContain("claude-code");
		expect(INSTALL_INSTRUCTIONS.opencode).toContain("opencode");
		expect(INSTALL_INSTRUCTIONS.codex).toContain("codex");
	});
});

describe("requireAgent", () => {
	test("throws with install instructions when preferred agent not found", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";

		try {
			const { requireAgent } = await import("../../src/workspace/agent.ts");
			await expect(requireAgent("codex")).rejects.toThrow("not installed");
		} finally {
			process.env.PATH = originalPath;
		}
	});

	test("throws listing all agents when none available", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";

		try {
			const { requireAgent } = await import("../../src/workspace/agent.ts");
			await expect(requireAgent()).rejects.toThrow("No agentic coding tool found");
		} finally {
			process.env.PATH = originalPath;
		}
	});
});

describe("detectAgents", () => {
	test("returns array (may be empty or populated depending on env)", async () => {
		const { detectAgents } = await import("../../src/workspace/agent.ts");
		const agents = await detectAgents();
		expect(Array.isArray(agents)).toBe(true);
		for (const agent of agents) {
			expect(["claude", "opencode", "codex"]).toContain(agent.name);
			expect(agent.path.length).toBeGreaterThan(0);
		}
	});
});
