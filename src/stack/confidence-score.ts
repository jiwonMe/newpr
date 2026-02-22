import type { FileGroup } from "../types/output.ts";
import type { FileSymbols } from "./symbol-flow.ts";

export type LayerType = "schema" | "refactor" | "codegen" | "core" | "integration" | "ui" | "test" | "unknown";

const LAYER_ORDER: Record<LayerType, number> = {
	schema: 0,
	codegen: 1,
	refactor: 2,
	core: 3,
	integration: 4,
	ui: 5,
	test: 6,
	unknown: 3,
};

const SCHEMA_PATH_RE = /\/(schema|types?|const|constants|config|model|interface)s?(?:\/|\.)/i;
const SCHEMA_SUFFIX_RE = /\.(schema|types?|const|d)\.[tj]sx?$/i;
const CODEGEN_PATH_RE = /\/(generated?|__generated?|\.generated?)\//i;
const TEST_PATH_RE = /\.(test|spec)\.[tj]sx?$|^\/?(__tests?__|tests?)\//i;
const UI_PATH_RE = /\.(tsx|css|scss|sass|less|html|vue|svelte)$|\/ui\/|\/components?\//i;
const INTEGRATION_PATH_RE = /\/(?:hooks?|providers?|context|store|api|adapters?|container|wiring)\//i;

function classifyLayer(filePath: string, symbols: FileSymbols | undefined): LayerType {
	if (TEST_PATH_RE.test(filePath)) return "test";
	if (CODEGEN_PATH_RE.test(filePath)) return "codegen";
	if (SCHEMA_SUFFIX_RE.test(filePath) || SCHEMA_PATH_RE.test(filePath)) return "schema";
	if (UI_PATH_RE.test(filePath)) return "ui";
	if (INTEGRATION_PATH_RE.test(filePath)) return "integration";

	if (symbols) {
		const importCount = symbols.imports.reduce((sum, imp) => sum + imp.names.length, 0);
		const exportCount = symbols.exports.length;
		if (importCount > 6 && exportCount < 3) return "integration";
		if (exportCount > 5 && importCount < 3) return "schema";
	}

	return "core";
}

export function classifyGroupLayer(group: FileGroup, symbolMap: Map<string, FileSymbols>): LayerType {
	const counts: Partial<Record<LayerType, number>> = {};
	for (const file of group.files) {
		const layer = classifyLayer(file, symbolMap.get(file));
		counts[layer] = (counts[layer] ?? 0) + 1;
	}
	if (Object.keys(counts).length === 0) return "unknown";
	let best: LayerType = "unknown";
	let bestCount = 0;
	for (const [layer, count] of Object.entries(counts) as [LayerType, number][]) {
		if (count > bestCount) { best = layer; bestCount = count; }
	}
	return best;
}

export function getLayerOrder(layer: LayerType): number {
	return LAYER_ORDER[layer];
}

export interface ConfidenceBreakdown {
	import: number;
	directory: number;
	symbol: number;
	coChange: number;
	layerBonus: number;
}

export interface GroupScore {
	groupName: string;
	total: number;
	breakdown: ConfidenceBreakdown;
}

function directoryScore(file: string, group: FileGroup): number {
	const fileParts = file.split("/");
	let maxOverlap = 0;
	for (const gf of group.files) {
		const gParts = gf.split("/");
		let overlap = 0;
		const limit = Math.min(fileParts.length - 1, gParts.length - 1);
		for (let i = 0; i < limit; i++) {
			if (fileParts[i] === gParts[i]) overlap++;
			else break;
		}
		if (overlap > maxOverlap) maxOverlap = overlap;
	}
	return Math.min(1, maxOverlap / 4);
}

function importScore(
	file: string,
	group: FileGroup,
	symbolMap: Map<string, FileSymbols>,
): number {
	const fileSyms = symbolMap.get(file);
	if (!fileSyms) return 0;

	const groupFileSet = new Set(group.files);
	let score = 0;

	for (const imp of fileSyms.imports) {
		if (groupFileSet.has(imp.from)) {
			score += Math.min(1, imp.names.length / 3);
		}
	}

	for (const gf of group.files) {
		const gSyms = symbolMap.get(gf);
		if (!gSyms) continue;
		for (const imp of gSyms.imports) {
			if (imp.from === file) {
				score += Math.min(1, imp.names.length / 3);
			}
		}
	}

	return Math.min(1, score / 3);
}

function symbolScore(
	file: string,
	group: FileGroup,
	symbolMap: Map<string, FileSymbols>,
): number {
	const fileSyms = symbolMap.get(file);
	if (!fileSyms || fileSyms.exports.length === 0) return 0;

	const fileExportSet = new Set(fileSyms.exports);
	let sharedCount = 0;

	for (const gf of group.files) {
		const gSyms = symbolMap.get(gf);
		if (!gSyms) continue;
		for (const imp of gSyms.imports) {
			for (const name of imp.names) {
				if (fileExportSet.has(name)) sharedCount++;
			}
		}
		for (const imp of fileSyms.imports) {
			for (const name of gSyms.exports) {
				if (imp.names.includes(name)) sharedCount++;
			}
		}
	}

	return Math.min(1, sharedCount / 5);
}

function coChangeScore(
	file: string,
	group: FileGroup,
	coChangePairs: Map<string, number>,
	totalCommits: number,
): number {
	if (totalCommits === 0) return 0;
	let total = 0;
	for (const gf of group.files) {
		const key = [file, gf].sort().join("|||");
		total += coChangePairs.get(key) ?? 0;
	}
	return Math.min(1, total / (totalCommits * 0.5));
}

function layerBonus(
	file: string,
	group: FileGroup,
	symbolMap: Map<string, FileSymbols>,
): number {
	const fileLayer = classifyLayer(file, symbolMap.get(file));
	const groupLayer = classifyGroupLayer(group, symbolMap);
	if (fileLayer === groupLayer) return 0.3;
	if (Math.abs(LAYER_ORDER[fileLayer] - LAYER_ORDER[groupLayer]) === 1) return 0.1;
	return 0;
}

export function scoreFileAgainstGroups(
	file: string,
	groups: FileGroup[],
	symbolMap: Map<string, FileSymbols>,
	coChangePairs: Map<string, number>,
	totalCommits: number,
): GroupScore[] {
	return groups.map((group) => {
		const breakdown: ConfidenceBreakdown = {
			import: importScore(file, group, symbolMap) * 0.4,
			directory: directoryScore(file, group) * 0.3,
			symbol: symbolScore(file, group, symbolMap) * 0.2,
			coChange: coChangeScore(file, group, coChangePairs, totalCommits) * 0.1,
			layerBonus: layerBonus(file, group, symbolMap),
		};
		const total = breakdown.import + breakdown.directory + breakdown.symbol + breakdown.coChange + breakdown.layerBonus;
		return { groupName: group.name, total, breakdown };
	}).sort((a, b) => b.total - a.total);
}

export interface ReassignmentResult {
	reassigned: Map<string, string>;
	warnings: Array<{ file: string; from: string; to: string; confidence: number }>;
}

const REASSIGN_THRESHOLD = 0.25;
const MIN_ADVANTAGE = 0.15;

export function computeConfidenceReassignments(
	ownership: Map<string, string>,
	groups: FileGroup[],
	symbolMap: Map<string, FileSymbols>,
	coChangePairs: Map<string, number>,
	totalCommits: number,
): ReassignmentResult {
	const reassigned = new Map<string, string>();
	const warnings: ReassignmentResult["warnings"] = [];

	const groupByName = new Map(groups.map((g) => [g.name, g]));

	for (const [file, currentGroup] of ownership) {
		const scores = scoreFileAgainstGroups(file, groups, symbolMap, coChangePairs, totalCommits);
		if (scores.length === 0) continue;

		const best = scores[0]!;
		if (best.groupName === currentGroup) continue;
		if (best.total < REASSIGN_THRESHOLD) continue;

		const currentScore = scores.find((s) => s.groupName === currentGroup);
		const currentTotal = currentScore?.total ?? 0;

		if (best.total - currentTotal < MIN_ADVANTAGE) continue;

		const targetGroup = groupByName.get(best.groupName);
		if (!targetGroup) continue;

		reassigned.set(file, best.groupName);
		warnings.push({
			file,
			from: currentGroup,
			to: best.groupName,
			confidence: best.total,
		});
	}

	return { reassigned, warnings };
}
