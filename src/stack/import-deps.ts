const IMPORT_PATTERNS: RegExp[] = [
	/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm,
	/^\s*export\s+.*?\s+from\s+['"]([^'"]+)['"]/gm,
	/^\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
	/^\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
];

const ANALYZABLE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

function isRelativeImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function extractImports(source: string): string[] {
	const imports = new Set<string>();
	for (const re of IMPORT_PATTERNS) {
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

	const ext = (f: string) => {
		const dot = f.lastIndexOf(".");
		return dot >= 0 ? f.slice(dot) : "";
	};

	const analyzable = changedFiles.filter((f) => ANALYZABLE_EXTENSIONS.has(ext(f)));

	await Promise.all(analyzable.map(async (filePath) => {
		const source = await readFileFromGit(repoPath, headSha, filePath);
		if (!source) return;

		const rawImports = extractImports(source);
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

	const groupDeps = new Map<string, Set<string>>();
	for (const [fromFile, toFiles] of fileDeps) {
		const fromGroup = ownership.get(fromFile);
		if (!fromGroup) continue;

		if (!groupDeps.has(fromGroup)) groupDeps.set(fromGroup, new Set());

		for (const toFile of toFiles) {
			const toGroup = ownership.get(toFile);
			if (!toGroup || toGroup === fromGroup) continue;
			groupDeps.get(fromGroup)!.add(toGroup);
		}
	}

	const groupDepsMap = new Map<string, string[]>();
	for (const [group, deps] of groupDeps) {
		groupDepsMap.set(group, Array.from(deps));
	}

	return { fileDeps, groupDeps: groupDepsMap };
}
