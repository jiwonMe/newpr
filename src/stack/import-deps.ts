const ANALYZABLE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

const EXT_TO_LOADER: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
	".ts": "ts",
	".tsx": "tsx",
	".js": "js",
	".jsx": "jsx",
	".mjs": "js",
	".cjs": "js",
};

const transpilerCache = new Map<string, InstanceType<typeof Bun.Transpiler>>();

function getTranspiler(loader: "ts" | "tsx" | "js" | "jsx"): InstanceType<typeof Bun.Transpiler> {
	let t = transpilerCache.get(loader);
	if (!t) {
		t = new Bun.Transpiler({ loader });
		transpilerCache.set(loader, t);
	}
	return t;
}

function isRelativeImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function fileExt(f: string): string {
	const dot = f.lastIndexOf(".");
	return dot >= 0 ? f.slice(dot) : "";
}

// scanImports skips `import type` — this catches them for dependency tracking
const TYPE_IMPORT_RE = /import\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/gs;

function extractImports(source: string, filePath: string): string[] {
	const ext = fileExt(filePath);
	const loader = EXT_TO_LOADER[ext];
	if (!loader) return [];

	try {
		const transpiler = getTranspiler(loader);
		const scanned = transpiler.scanImports(source);
		const results = new Set(
			scanned.map((imp) => imp.path).filter(isRelativeImport),
		);

		TYPE_IMPORT_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = TYPE_IMPORT_RE.exec(source)) !== null) {
			if (m[1] && isRelativeImport(m[1])) results.add(m[1]);
		}

		return Array.from(results);
	} catch {
		return extractImportsFallback(source);
	}
}

const FALLBACK_PATTERNS: RegExp[] = [
	// import/export ... from '...' (multiline-safe via [\s\S])
	/(?:import|export)\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
	// side-effect: import './foo'
	/import\s+['"]([^'"]+)['"]/g,
	// dynamic: import('./foo')
	/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	// require('./foo')
	/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractImportsFallback(source: string): string[] {
	const imports = new Set<string>();
	for (const re of FALLBACK_PATTERNS) {
		re.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = re.exec(source)) !== null) {
			const specifier = match[1];
			if (specifier && isRelativeImport(specifier)) {
				imports.add(specifier);
			}
		}
	}
	return Array.from(imports);
}

function resolveRelative(fromFile: string, specifier: string): string {
	const parts = fromFile.split("/");
	parts.pop();
	const segments = specifier.split("/");
	for (const seg of segments) {
		if (seg === "..") {
			parts.pop();
		} else if (seg !== ".") {
			parts.push(seg);
		}
	}
	return parts.join("/");
}

function resolveToExistingFile(
	candidate: string,
	fileSet: Set<string>,
): string | null {
	if (fileSet.has(candidate)) return candidate;

	for (const ext of ANALYZABLE_EXTENSIONS) {
		const withExt = `${candidate}${ext}`;
		if (fileSet.has(withExt)) return withExt;
	}

	for (const indexFile of ["index.ts", "index.tsx", "index.js"]) {
		const asDir = `${candidate}/${indexFile}`;
		if (fileSet.has(asDir)) return asDir;
	}

	return null;
}

async function readFileFromGit(repoPath: string, sha: string, filePath: string): Promise<string | null> {
	const result = await Bun.$`git -C ${repoPath} show ${sha}:${filePath}`.quiet().nothrow();
	if (result.exitCode !== 0) return null;
	return result.stdout.toString();
}

export function rebuildGroupDeps(
	fileDeps: Map<string, string[]>,
	ownership: Map<string, string>,
): Map<string, string[]> {
	const groupDeps = new Map<string, Set<string>>();
	for (const [fromFile, toFiles] of fileDeps) {
		const fromGroup = ownership.get(fromFile);
		if (!fromGroup) continue;

		for (const toFile of toFiles) {
			const toGroup = ownership.get(toFile);
			if (!toGroup || toGroup === fromGroup) continue;
			if (!groupDeps.has(fromGroup)) groupDeps.set(fromGroup, new Set());
			groupDeps.get(fromGroup)!.add(toGroup);
		}
	}

	const result = new Map<string, string[]>();
	for (const [group, deps] of groupDeps) {
		if (deps.size > 0) {
			result.set(group, Array.from(deps));
		}
	}
	return result;
}

function tarjanSCC(nodes: string[], adj: Map<string, string[]>): string[][] {
	let idx = 0;
	const indices = new Map<string, number>();
	const lowlinks = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const sccs: string[][] = [];

	function visit(v: string) {
		indices.set(v, idx);
		lowlinks.set(v, idx);
		idx++;
		stack.push(v);
		onStack.add(v);

		for (const w of adj.get(v) ?? []) {
			if (!indices.has(w)) {
				visit(w);
				lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
			} else if (onStack.has(w)) {
				lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
			}
		}

		if (lowlinks.get(v) === indices.get(v)) {
			const scc: string[] = [];
			let w: string;
			do {
				w = stack.pop()!;
				onStack.delete(w);
				scc.push(w);
			} while (w !== v);
			sccs.push(scc);
		}
	}

	for (const v of nodes) {
		if (!indices.has(v)) visit(v);
	}
	return sccs;
}

export interface ImportCycleMergeResult<G extends { name: string; files: string[] }> {
	groups: G[];
	ownership: Map<string, string>;
	mergedCycles: string[][];
}

export function mergeImportCycleGroups<G extends { name: string; files: string[]; key_changes?: string[]; description: string }>(
	groups: G[],
	ownership: Map<string, string>,
	groupDeps: Map<string, string[]>,
): ImportCycleMergeResult<G> {
	const groupNames = groups.map((g) => g.name);
	const sccs = tarjanSCC(groupNames, groupDeps);
	const cycleSCCs = sccs.filter((scc) => scc.length > 1);

	if (cycleSCCs.length === 0) {
		return { groups: [...groups], ownership: new Map(ownership), mergedCycles: [] };
	}

	const newOwnership = new Map(ownership);
	const groupMap = new Map(groups.map((g) => [g.name, g]));
	const absorbed = new Set<string>();

	for (const scc of cycleSCCs) {
		const survivor = groupMap.get(scc[0]!)!;
		for (let i = 1; i < scc.length; i++) {
			const victim = groupMap.get(scc[i]!)!;
			for (const file of victim.files) {
				if (!survivor.files.includes(file)) survivor.files.push(file);
			}
			if (victim.key_changes) {
				survivor.key_changes = [...(survivor.key_changes ?? []), ...victim.key_changes];
			}
			survivor.description = survivor.description || victim.description;
			for (const [path, gid] of newOwnership) {
				if (gid === victim.name) newOwnership.set(path, survivor.name);
			}
			absorbed.add(victim.name);
		}
	}

	const remaining = groups.filter((g) => !absorbed.has(g.name));
	return { groups: remaining, ownership: newOwnership, mergedCycles: cycleSCCs };
}

export interface ImportDepResult {
	fileDeps: Map<string, string[]>;
	groupDeps: Map<string, string[]>;
}

export async function analyzeImportDependencies(
	repoPath: string,
	headSha: string,
	changedFiles: string[],
	ownership: Map<string, string>,
): Promise<ImportDepResult> {
	const fileSet = new Set(changedFiles);
	const fileDeps = new Map<string, string[]>();

	const analyzable = changedFiles.filter((f) => ANALYZABLE_EXTENSIONS.has(fileExt(f)));

	await Promise.all(analyzable.map(async (filePath) => {
		const source = await readFileFromGit(repoPath, headSha, filePath);
		if (!source) return;

		const rawImports = extractImports(source, filePath);
		const resolved: string[] = [];

		for (const specifier of rawImports) {
			const candidate = resolveRelative(filePath, specifier);
			const existing = resolveToExistingFile(candidate, fileSet);
			if (existing && existing !== filePath) {
				resolved.push(existing);
			}
		}

		if (resolved.length > 0) {
			fileDeps.set(filePath, resolved);
		}
	}));

	return { fileDeps, groupDeps: rebuildGroupDeps(fileDeps, ownership) };
}
