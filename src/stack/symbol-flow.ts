import { parse } from "meriyah";

const ANALYZABLE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

export interface NamedImport {
	from: string;
	names: string[];
}

export interface FileSymbols {
	path: string;
	exports: string[];
	imports: NamedImport[];
}

type AstNode = { type: string;[key: string]: unknown };
type AstProgram = { type: "Program"; body: AstNode[] };

function safeParseAst(source: string): AstProgram | null {
	try {
		return parse(source, { module: true, jsx: true, next: true, raw: false, ranges: false }) as unknown as AstProgram;
	} catch {
	}
	try {
		return parse(source, { module: true, jsx: false, next: true, raw: false, ranges: false }) as unknown as AstProgram;
	} catch {
	}
	return null;
}

function getId(node: AstNode): string | null {
	const id = node["id"] as { name: string } | undefined;
	return id?.name ?? null;
}

function extractFromAst(
	ast: AstProgram,
	resolveSpecifier: (s: string) => string | null,
): { exports: string[]; imports: NamedImport[] } {
	const exports: string[] = [];
	const importsMap = new Map<string, string[]>();

	const addImport = (from: string | null, names: string[]) => {
		if (!from) return;
		const arr = importsMap.get(from) ?? [];
		for (const n of names) arr.push(n);
		importsMap.set(from, arr);
	};

	for (const node of ast.body) {
		if (node.type === "ExportNamedDeclaration") {
			const decl = node["declaration"] as AstNode | null;
			if (decl) {
				const name = getId(decl);
				if (name) exports.push(name);
				if (decl.type === "VariableDeclaration") {
					for (const d of (decl["declarations"] as AstNode[])) {
						const id = d["id"] as AstNode;
						if (id.type === "Identifier") exports.push(id["name"] as string);
					}
				}
			}
			const specifiers = node["specifiers"] as Array<{ exported: { name: string } }>;
			for (const s of specifiers ?? []) exports.push(s.exported.name);

			const src = (node["source"] as { value: string } | null)?.value;
			if (src) {
				const from = resolveSpecifier(src);
				const names = (specifiers ?? []).map((s) => s.exported.name);
				addImport(from, names);
			}
		} else if (node.type === "ExportDefaultDeclaration") {
			exports.push("default");
		} else if (node.type === "ExportAllDeclaration") {
			const src = (node["source"] as { value: string } | null)?.value;
			if (src) addImport(resolveSpecifier(src), ["*"]);
		} else if (node.type === "ImportDeclaration") {
			const src = (node["source"] as { value: string }).value;
			const from = resolveSpecifier(src);
			const names = (node["specifiers"] as AstNode[]).map((s) => {
				if (s.type === "ImportSpecifier") return (s["imported"] as { name: string }).name;
				if (s.type === "ImportDefaultSpecifier") return "default";
				if (s.type === "ImportNamespaceSpecifier") return "*";
				return "";
			}).filter(Boolean);
			addImport(from, names);
		}
	}

	const imports: NamedImport[] = [];
	for (const [from, names] of importsMap) {
		imports.push({ from, names: [...new Set(names)] });
	}
	return { exports: [...new Set(exports)], imports };
}

const EXPORT_RE = /\bexport\s+(?:default\s+)?(?:(?:async\s+)?function\s*\*?\s*(\w+)|class\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+)|type\s+(\w+)|interface\s+(\w+)|enum\s+(\w+))/g;
const NAMED_EXPORT_RE = /\bexport\s*\{([^}]+)\}/g;
const IMPORT_FROM_RE = /\bimport\s+(?:type\s+)?(?:\*\s+as\s+\w+|(?:\w+\s*,\s*)?\{([^}]*)\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_FROM_RE = /\bexport\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;

function extractFallback(
	source: string,
	resolveSpecifier: (s: string) => string | null,
): { exports: string[]; imports: NamedImport[] } {
	const exports: string[] = [];
	const importsMap = new Map<string, string[]>();

	let m: RegExpExecArray | null;

	EXPORT_RE.lastIndex = 0;
	while ((m = EXPORT_RE.exec(source)) !== null) {
		const name = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? m[8];
		if (name) exports.push(name);
	}

	NAMED_EXPORT_RE.lastIndex = 0;
	while ((m = NAMED_EXPORT_RE.exec(source)) !== null) {
		for (const spec of m[1]!.split(",")) {
			const name = spec.trim().split(/\s+as\s+/).pop()?.trim();
			if (name) exports.push(name);
		}
	}

	const addFromSpec = (rawNames: string | null, rawSpecifier: string | undefined) => {
		if (!rawSpecifier) return;
		const from = resolveSpecifier(rawSpecifier);
		if (!from) return;
		const names = rawNames
			? rawNames.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]?.trim() ?? "").filter(Boolean)
			: [];
		const arr = importsMap.get(from) ?? [];
		arr.push(...names);
		importsMap.set(from, arr);
	};

	IMPORT_FROM_RE.lastIndex = 0;
	while ((m = IMPORT_FROM_RE.exec(source)) !== null) addFromSpec(m[1] ?? null, m[2]);

	EXPORT_FROM_RE.lastIndex = 0;
	while ((m = EXPORT_FROM_RE.exec(source)) !== null) addFromSpec(m[1] ?? null, m[2]);

	const imports: NamedImport[] = [];
	for (const [from, names] of importsMap) {
		imports.push({ from, names: [...new Set(names)] });
	}
	return { exports: [...new Set(exports)], imports };
}

function fileExt(f: string): string {
	const dot = f.lastIndexOf(".");
	return dot >= 0 ? f.slice(dot) : "";
}

function resolveRelative(fromFile: string, specifier: string): string {
	const parts = fromFile.split("/");
	parts.pop();
	for (const seg of specifier.split("/")) {
		if (seg === "..") parts.pop();
		else if (seg !== ".") parts.push(seg);
	}
	return parts.join("/");
}

function resolveToFile(candidate: string, fileSet: Set<string>): string | null {
	if (fileSet.has(candidate)) return candidate;
	for (const ext of ANALYZABLE_EXTENSIONS) {
		if (fileSet.has(`${candidate}${ext}`)) return `${candidate}${ext}`;
	}
	for (const idx of ["index.ts", "index.tsx", "index.js"]) {
		if (fileSet.has(`${candidate}/${idx}`)) return `${candidate}/${idx}`;
	}
	return null;
}

export async function extractSymbols(
	repoPath: string,
	headSha: string,
	filePaths: string[],
): Promise<Map<string, FileSymbols>> {
	const fileSet = new Set(filePaths);
	const analyzable = filePaths.filter((f) => ANALYZABLE_EXTENSIONS.has(fileExt(f)));
	const result = new Map<string, FileSymbols>();

	await Promise.all(analyzable.map(async (filePath) => {
		const r = await Bun.$`git -C ${repoPath} show ${headSha}:${filePath}`.quiet().nothrow();
		if (r.exitCode !== 0) return;

		const source = r.stdout.toString();

		const resolveSpecifier = (specifier: string): string | null => {
			if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
			const candidate = resolveRelative(filePath, specifier);
			return resolveToFile(candidate, fileSet);
		};

		let symbols: { exports: string[]; imports: NamedImport[] } | null = null;
		const ast = safeParseAst(source);
		if (ast) {
			try {
				symbols = extractFromAst(ast, resolveSpecifier);
			} catch {
			}
		}
		if (!symbols) symbols = extractFallback(source, resolveSpecifier);

		result.set(filePath, {
			path: filePath,
			exports: symbols.exports,
			imports: symbols.imports,
		});
	}));

	return result;
}

export function buildSymbolIndex(symbolMap: Map<string, FileSymbols>): Map<string, string[]> {
	const exportedBy = new Map<string, string[]>();
	for (const [file, info] of symbolMap) {
		for (const sym of info.exports) {
			const arr = exportedBy.get(sym) ?? [];
			arr.push(file);
			exportedBy.set(sym, arr);
		}
	}
	return exportedBy;
}
