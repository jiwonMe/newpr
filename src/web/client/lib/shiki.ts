import { createHighlighter, type Highlighter } from "shiki";

export const SHIKI_LANGS = [
	"typescript", "tsx", "javascript", "jsx",
	"python", "go", "rust", "css", "json",
	"yaml", "html", "bash", "java", "c",
	"cpp", "ruby", "php", "swift", "kotlin",
	"sql", "markdown", "toml", "xml",
	"csharp", "dart", "lua", "zig", "graphql",
	"dockerfile", "prisma", "svelte", "vue",
	"scss", "less", "r", "scala", "elixir",
	"haskell", "ocaml", "perl",
] as const;

export type ShikiLang = (typeof SHIKI_LANGS)[number];

let hlInstance: Highlighter | null = null;
let hlLoading: Promise<Highlighter> | null = null;

export function ensureHighlighter(): Promise<Highlighter> {
	if (hlInstance) return Promise.resolve(hlInstance);
	if (!hlLoading) {
		hlLoading = createHighlighter({
			themes: ["github-light", "github-dark"],
			langs: [...SHIKI_LANGS],
		}).then((hl) => { hlInstance = hl; return hl; });
	}
	return hlLoading;
}

ensureHighlighter().catch(() => {});

export function getHighlighterSync(): Highlighter | null {
	return hlInstance;
}

const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
	js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
	py: "python", pyi: "python",
	go: "go", rs: "rust",
	css: "css", scss: "scss", less: "less",
	json: "json", jsonc: "json",
	yaml: "yaml", yml: "yaml",
	html: "html", htm: "html",
	vue: "vue", svelte: "svelte",
	sh: "bash", bash: "bash", zsh: "bash",
	java: "java", kt: "kotlin",
	c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
	cs: "csharp",
	rb: "ruby", php: "php", swift: "swift",
	sql: "sql", md: "markdown", mdx: "markdown",
	toml: "toml", xml: "xml",
	dart: "dart", lua: "lua", zig: "zig",
	graphql: "graphql", gql: "graphql",
	prisma: "prisma",
	dockerfile: "dockerfile",
	r: "r", R: "r",
	scala: "scala", sc: "scala",
	ex: "elixir", exs: "elixir",
	hs: "haskell", ml: "ocaml",
	pl: "perl", pm: "perl",
};

const NAME_TO_LANG: Record<string, string> = {
	Dockerfile: "dockerfile",
	Makefile: "bash",
	Gemfile: "ruby",
	Rakefile: "ruby",
};

export function detectShikiLang(filePath: string): ShikiLang | null {
	const fileName = filePath.split("/").pop() ?? "";
	const nameLang = NAME_TO_LANG[fileName];
	if (nameLang) return nameLang as ShikiLang;
	const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
	return (EXT_TO_LANG[ext] as ShikiLang | undefined) ?? null;
}

export function langFromClassName(className: string | undefined): ShikiLang | null {
	if (!className) return null;
	const match = className.match(/language-(\w+)/);
	if (!match) return null;
	const raw = match[1]!.toLowerCase();
	const mapped = EXT_TO_LANG[raw] ?? raw;
	if ((SHIKI_LANGS as readonly string[]).includes(mapped)) return mapped as ShikiLang;
	return null;
}
