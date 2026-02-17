import { test, expect, describe } from "bun:test";
import { parsePrInput } from "../../src/github/parse-pr.ts";

describe("parsePrInput", () => {
	test("parses full GitHub URL", () => {
		const result = parsePrInput("https://github.com/sionic/newpr/pull/42");
		expect(result).toEqual({ owner: "sionic", repo: "newpr", number: 42 });
	});

	test("parses GitHub URL with trailing path", () => {
		const result = parsePrInput("https://github.com/owner/repo/pull/99/files");
		expect(result).toEqual({ owner: "owner", repo: "repo", number: 99 });
	});

	test("parses owner/repo#number format", () => {
		const result = parsePrInput("facebook/react#12345");
		expect(result).toEqual({ owner: "facebook", repo: "react", number: 12345 });
	});

	test("parses #number with --repo flag", () => {
		const result = parsePrInput("#123", "owner/repo");
		expect(result).toEqual({ owner: "owner", repo: "repo", number: 123 });
	});

	test("parses bare number with --repo flag", () => {
		const result = parsePrInput("456", "owner/repo");
		expect(result).toEqual({ owner: "owner", repo: "repo", number: 456 });
	});

	test("throws when number given without --repo", () => {
		expect(() => parsePrInput("123")).toThrow("--repo");
	});

	test("throws on invalid --repo format", () => {
		expect(() => parsePrInput("123", "just-repo")).toThrow("owner/repo");
	});

	test("throws on completely invalid input", () => {
		expect(() => parsePrInput("not-a-pr")).toThrow("Cannot parse");
	});

	test("parses https URL with http", () => {
		const result = parsePrInput("http://github.com/a/b/pull/1");
		expect(result).toEqual({ owner: "a", repo: "b", number: 1 });
	});
});
