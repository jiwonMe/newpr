import { useState, useEffect, useMemo, type ReactNode } from "react";
import { createHighlighter, type Highlighter, type ThemedToken } from "shiki";

interface DiffLine {
	type: "header" | "hunk" | "added" | "removed" | "context" | "binary";
	content: string;
	oldNum: number | null;
	newNum: number | null;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const RENDER_CAP = 2000;
const TOTAL_CAP = 3000;

const SHIKI_LANGS = [
	"typescript", "tsx", "javascript", "jsx",
	"python", "go", "rust", "css", "json",
	"yaml", "html", "bash", "java", "c",
	"cpp", "ruby", "php", "swift", "kotlin",
	"sql", "markdown", "toml", "xml",
] as const;

let hlInstance: Highlighter | null = null;
let hlLoading: Promise<Highlighter> | null = null;

function ensureHighlighter(): Promise<Highlighter> {
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

const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
	js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
	py: "python", pyi: "python",
	go: "go", rs: "rust",
	css: "css", scss: "css", less: "css",
	json: "json", jsonc: "json",
	yaml: "yaml", yml: "yaml",
	html: "html", htm: "html", svg: "xml", xml: "xml",
	sh: "bash", bash: "bash", zsh: "bash",
	java: "java", kt: "kotlin", kts: "kotlin",
	c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
	rb: "ruby", php: "php", swift: "swift",
	sql: "sql", md: "markdown", mdx: "markdown",
	toml: "toml",
};

type ShikiLang = (typeof SHIKI_LANGS)[number];

function detectShikiLang(filePath: string): ShikiLang | null {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	return (EXT_TO_LANG[ext] as ShikiLang | undefined) ?? null;
}

function parseLines(patch: string): DiffLine[] {
	const raw = patch.split("\n");
	const lines: DiffLine[] = [];
	let oldNum = 0;
	let newNum = 0;

	if (raw.some((l) => l.startsWith("Binary files") || l.includes("GIT binary patch"))) {
		return [{ type: "binary", content: "Binary file — cannot display diff", oldNum: null, newNum: null }];
	}

	for (const line of raw) {
		if (
			line.startsWith("diff --git") ||
			line.startsWith("index ") ||
			line.startsWith("--- ") ||
			line.startsWith("+++ ") ||
			line.startsWith("old mode") ||
			line.startsWith("new mode") ||
			line.startsWith("new file mode") ||
			line.startsWith("deleted file mode") ||
			line.startsWith("rename from") ||
			line.startsWith("rename to") ||
			line.startsWith("similarity index")
		) {
			lines.push({ type: "header", content: line, oldNum: null, newNum: null });
			continue;
		}

		const hunkMatch = line.match(HUNK_RE);
		if (hunkMatch) {
			oldNum = Number(hunkMatch[1]);
			newNum = Number(hunkMatch[2]);
			lines.push({ type: "hunk", content: line, oldNum: null, newNum: null });
			continue;
		}

		if (line.startsWith("+")) {
			lines.push({ type: "added", content: line.slice(1), oldNum: null, newNum: newNum });
			newNum++;
		} else if (line.startsWith("-")) {
			lines.push({ type: "removed", content: line.slice(1), oldNum: oldNum, newNum: null });
			oldNum++;
		} else if (line.startsWith("\\")) {
			lines.push({ type: "context", content: line, oldNum: null, newNum: null });
		} else {
			const text = line.startsWith(" ") ? line.slice(1) : line;
			if (oldNum > 0 || newNum > 0) {
				lines.push({ type: "context", content: text, oldNum: oldNum, newNum: newNum });
				oldNum++;
				newNum++;
			} else {
				lines.push({ type: "context", content: text, oldNum: null, newNum: null });
			}
		}
	}

	return lines;
}

function useHighlighter(): Highlighter | null {
	const [hl, setHl] = useState<Highlighter | null>(hlInstance);
	useEffect(() => {
		if (!hl) ensureHighlighter().then(setHl).catch(() => {});
	}, [hl]);
	return hl;
}

function useDarkMode(): boolean {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	return dark;
}

type TokenMap = Map<number, ThemedToken[]>;

function useTokenizedLines(
	hl: Highlighter | null,
	lines: DiffLine[],
	lang: ShikiLang | null,
	dark: boolean,
): TokenMap | null {
	return useMemo(() => {
		if (!hl || !lang) return null;

		const codeIndices: number[] = [];
		const codeLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const t = lines[i]!.type;
			if (t === "added" || t === "removed" || t === "context") {
				codeIndices.push(i);
				codeLines.push(lines[i]!.content);
			}
		}

		if (codeLines.length === 0) return null;

		try {
			const theme = dark ? "github-dark" : "github-light";
			const result = hl.codeToTokens(codeLines.join("\n"), { lang, theme });
			const map: TokenMap = new Map();
			for (let j = 0; j < codeIndices.length; j++) {
				const tokens = result.tokens[j];
				if (tokens) map.set(codeIndices[j]!, tokens);
			}
			return map;
		} catch {
			return null;
		}
	}, [hl, lines, lang, dark]);
}

function renderHighlighted(tokens: ThemedToken[]): ReactNode {
	return tokens.map((t, i) => (
		<span key={i} style={t.color ? { color: t.color } : undefined}>{t.content}</span>
	));
}

const ROW_STYLE: Record<DiffLine["type"], string> = {
	header: "text-muted-foreground",
	hunk: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	added: "bg-green-500/10",
	removed: "bg-red-500/10",
	context: "",
	binary: "text-muted-foreground italic py-4 text-center",
};

const GUTTER_STYLE: Record<string, string> = {
	added: "bg-green-500/15 text-green-600/60 dark:text-green-400/60",
	removed: "bg-red-500/15 text-red-600/60 dark:text-red-400/60",
	default: "text-muted-foreground/40",
};

const PREFIX_STYLE: Record<string, string> = {
	added: "text-green-700 dark:text-green-300 select-none",
	removed: "text-red-700 dark:text-red-300 select-none",
	context: "text-transparent select-none",
};

export function DiffViewer({ patch, filePath, githubUrl }: { patch: string; filePath: string; githubUrl?: string }) {
	const [showAll, setShowAll] = useState(false);
	const hl = useHighlighter();
	const dark = useDarkMode();
	const lang = useMemo(() => detectShikiLang(filePath), [filePath]);
	const allLines = useMemo(() => parseLines(patch), [patch]);
	const tokenMap = useTokenizedLines(hl, allLines, lang, dark);
	const isCapped = !showAll && allLines.length > TOTAL_CAP;
	const lines = isCapped ? allLines.slice(0, RENDER_CAP) : allLines;
	const fileName = filePath.split("/").pop() ?? filePath;

	return (
		<div className="rounded-lg border overflow-hidden">
			<div className="sticky top-0 z-10 bg-muted px-3 py-1.5 border-b">
				<span className="text-xs font-mono font-medium truncate" title={filePath}>
					{fileName}
				</span>
			</div>
			<div className="overflow-x-auto">
				<div className="min-w-max font-mono text-xs leading-5 select-text">
					{lines.map((line, i) => {
						if (line.type === "binary") {
							return (
								<div key={i} className={ROW_STYLE.binary}>
									{line.content}
								</div>
							);
						}

						if (line.type === "header") {
							return (
								<div key={i} className={`px-3 ${ROW_STYLE.header}`}>
									{line.content}
								</div>
							);
						}

						if (line.type === "hunk") {
							return (
								<div key={i} className={`px-3 py-0.5 ${ROW_STYLE.hunk}`}>
									{line.content}
								</div>
							);
						}

						const gutterStyle = GUTTER_STYLE[line.type] ?? GUTTER_STYLE.default;
						const prefix = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
						const prefixStyle = PREFIX_STYLE[line.type] ?? PREFIX_STYLE.context;
						const tokens = tokenMap?.get(i);
						const content = tokens ? renderHighlighted(tokens) : line.content;

						return (
							<div key={i} className={`flex ${ROW_STYLE[line.type]}`}>
								<span className={`inline-block w-10 shrink-0 text-right pr-1 select-none ${gutterStyle}`}>
									{line.oldNum ?? ""}
								</span>
								<span className={`inline-block w-10 shrink-0 text-right pr-1 select-none border-r border-border/50 ${gutterStyle}`}>
									{line.newNum ?? ""}
								</span>
								<span className={`inline-block w-4 shrink-0 text-center ${prefixStyle}`}>{prefix}</span>
								<span className="pr-3 whitespace-pre">{content}</span>
							</div>
						);
					})}
				</div>
			</div>
			{isCapped && (
				<button
					type="button"
					onClick={() => setShowAll(true)}
					className="w-full py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-accent/50 transition-colors border-t"
				>
					Show all {allLines.length} lines
				</button>
			)}
			{githubUrl && (
				<div className="px-3 py-2 border-t text-center">
					<a
						href={githubUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
					>
						View on GitHub
					</a>
				</div>
			)}
		</div>
	);
}
