import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Singleton highlighter — loaded once, shared across all CodeBlock instances
let _highlighter: HighlighterCore | null = null;
let _highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
	if (_highlighter) return Promise.resolve(_highlighter);
	if (_highlighterPromise) return _highlighterPromise;
	_highlighterPromise = createHighlighterCore({
		themes: [import("@shikijs/themes/github-dark")],
		langs: [import("@shikijs/langs/typescript")],
		engine: createJavaScriptRegexEngine(),
	}).then((h) => { _highlighter = h; return h; });
	return _highlighterPromise;
}

// ============================================================================
// Types
// ============================================================================

type Locale = "en" | "ko";

type ContentBlock =
	| { kind: "p"; text: string }
	| { kind: "code"; code: string; caption?: string }
	| { kind: "note"; text: string; title?: string };

interface ArticleSection {
	id: string;
	title: string;
	blocks: ContentBlock[];
}

interface ReferenceItem {
	id: string;
	text: string;
	url?: string;
}

interface ArticleContent {
	htmlLang: string;
	pageTitle: string;
	badge: string;
	title: string;
	subtitle: string;
	updated: string;
	readingTime: string;
	homeLabel: string;
	langSwitchLabel: string;
	langSwitchPath: string;
	ctaLabel: string;
	ctaPath: string;
	articleSections: ArticleSection[];
	references: ReferenceItem[];
	referencesTitle: string;
	closingTitle: string;
	closingParagraph: string;
}

// ============================================================================
// Shared Code Snippets
// ============================================================================

const CODE_TYPES = `interface StackPlan {
  base_sha: string;
  head_sha: string;
  groups: StackGroup[];
  expected_trees: Map<string, string>;   // groupId → predicted tree SHA
  ancestor_sets: Map<string, string[]>;  // groupId → transitive ancestor groupIds
}

interface StackGroup {
  id: string;
  name: string;
  type: GroupType;         // "feature" | "refactor" | "bugfix" | "chore" | ...
  description: string;
  files: string[];
  deps: string[];          // direct DAG parent group IDs
  explicit_deps?: string[];
  order: number;
}`;

const CODE_ANCESTOR = `function buildAncestorSets(
  groupOrder: string[],
  dagParents: Map<string, string[]>,
): Map<string, Set<string>> {
  const ancestors = new Map<string, Set<string>>();

  for (const gid of groupOrder) {
    const set = new Set<string>();
    const queue = [...(dagParents.get(gid) ?? [])];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (set.has(node)) continue;
      set.add(node);
      for (const p of dagParents.get(node) ?? []) queue.push(p);
    }
    ancestors.set(gid, set);
  }
  return ancestors;
}`;

const CODE_SYMBOLS = `interface FileSymbols {
  path: string;
  exports: string[];         // named exports found in this file
  imports: NamedImport[];    // resolved imports from other changed files
}

interface NamedImport {
  from: string;              // resolved file path (not the raw specifier)
  names: string[];           // imported symbol names
}`;

const CODE_RESOLVE = `function resolveToFile(candidate: string, fileSet: Set<string>): string | null {
  if (fileSet.has(candidate)) return candidate;
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    if (fileSet.has(candidate + ext)) return candidate + ext;
  }
  for (const idx of ["index.ts", "index.tsx", "index.js"]) {
    if (fileSet.has(candidate + "/" + idx)) return candidate + "/" + idx;
  }
  return null;
}`;

const CODE_CONFIDENCE = `interface ConfidenceBreakdown {
  import: number;      // weight: 0.4
  directory: number;   // weight: 0.3
  symbol: number;      // weight: 0.2
  coChange: number;    // weight: 0.1
  layerBonus: number;  // up to 0.3 for same-layer match
}

// Reassignment fires when:
const REASSIGN_THRESHOLD = 0.25;  // best score must exceed this
const MIN_ADVANTAGE = 0.15;       // gap over current group must exceed this`;

const CODE_CONSTRAINT = `type ConstraintKind = "dependency" | "path-order";

interface ConstraintEdge {
  from: string;       // source group ID
  to: string;         // target group ID
  kind: ConstraintKind;
  evidence?: {
    path: string;
    from_commit?: string;
    to_commit?: string;
  };
}`;

const CODE_CYCLE = `function breakRemainingCycles(edges: ConstraintEdge[]): ConstraintEdge[] {
  const groups = [...new Set(edges.flatMap(e => [e.from, e.to]))];
  if (!hasCycle(groups, edges)) return edges;

  // Sort: path-order edges are weaker, try removing them first
  const prioritized = [...edges].sort((a, b) => {
    const score = (e: ConstraintEdge) =>
      e.kind === "path-order" ? 0 : e.kind === "dependency" ? 1 : 2;
    return score(a) - score(b);
  });

  // Greedy: add edges one by one, skip if it creates a cycle
  const result: ConstraintEdge[] = [];
  for (const edge of prioritized) {
    result.push(edge);
    if (hasCycle(groups, result)) {
      result.pop();  // this edge would create a cycle — drop it
    }
  }
  return result;
}`;

const CODE_COMMIT = `// For each group in topological order:
const deps = group.deps.filter(dep => dep !== gid);
const directParents = deps.length > 0
  ? deps.map(dep => commitBySha.get(dep)!)  // parent group commits
  : [plan.base_sha];                        // no deps → base SHA

const parentArgs = directParents.flatMap(p => ["-p", p]);

// git commit-tree creates a commit object with explicit parents
const commitSha = await git("commit-tree", treeSha, ...parentArgs, "-m", message);`;

const CODE_VERIFY = `async function verifyFinalTreeEquivalence(
  repoPath: string,
  headSha: string,
  execResult: StackExecResult,
  errors: string[],
): Promise<void> {
  const headTree = await git("rev-parse", headSha + "^{tree}");
  if (execResult.final_tree_sha !== headTree) {
    errors.push(
      \`Final tree mismatch: stack = \${execResult.final_tree_sha}, HEAD = \${headTree}\`
    );
  }
}`;

const CODE_PIPELINE = `extractDeltas → extractSymbols → analyzeImportDeps
  → partitionGroups (+ confidenceScoring)
  → applyCouplingRules → buildCoChangePairs
  → splitOversizedGroups → rebalanceGroups
  → checkFeasibility (+ softCycleBreaking)
  → createStackPlan (DAG parents + ancestor sets)
  → executeStack (multi-parent commits)
  → verifyStack`;

// ============================================================================
// EN Content
// ============================================================================

const EN_CONTENT: ArticleContent = {
	htmlLang: "en",
	pageTitle: "How PR Stacking Works",
	badge: "Engineering Deep Dive",
	title: "How PR Stacking Works",
	subtitle:
		"A technical reference on how newpr decomposes a single pull request into a DAG of smaller draft PRs — using AST-level symbol flow, multi-signal confidence scoring, and greedy cycle resolution — while preserving byte-identical tree output.",
	updated: "Updated for v1.0.23",
	readingTime: "~15 min read",
	homeLabel: "Back to landing",
	langSwitchLabel: "한국어",
	langSwitchPath: "/newpr/ko/stacking-principles.html",
	ctaLabel: "Try newpr",
	ctaPath: "https://github.com/jiwonMe/newpr",
	referencesTitle: "References",
	closingTitle: "Summary",
	closingParagraph:
		"PR stacking is a correctness-constrained DAG transformation. The input is one large review unit. The output is many smaller ones, arranged so that independent concerns can be reviewed in parallel and dependent concerns maintain correct merge order. The invariant — byte-identical final tree — ensures the transformation never changes behavior. Everything else in the pipeline exists to make that invariant achievable: symbol flow finds real dependencies, confidence scoring corrects misclassifications, cycle breaking removes contradictions, and verification proves the result.",
	articleSections: [
		// ================================================================
		// Section 1: The Problem
		// ================================================================
		{
			id: "problem",
			title: "The Problem",
			blocks: [
				{
					kind: "p",
					text: "Large pull requests fail in a way that is both predictable and well-documented. Past a few hundred lines of diff, reviewers shift from understanding architectural intent to scanning for surface-level mistakes. The result is a review that catches typos but misses design flaws.",
				},
				{
					kind: "p",
					text: "Sadowski et al. [1] studied over 9 million code changes at Google and found that smaller, focused changes receive faster and more thorough reviews. The Propel study [6] analyzed 50,000+ pull requests and reported that PRs in the 200–400 line range have 40% fewer post-merge defects compared to larger ones, while PRs over 1,000 lines see defect detection rates drop by 70%.",
				},
				{
					kind: "p",
					text: "di Biase et al. [2] ran controlled experiments confirming that decomposing changes before review leads to significantly better outcomes — reviewers find more defects and provide higher-quality feedback when changes are focused. Kudrjavets et al. [3] observed this across multiple programming languages: smaller changes merge faster, receive more meaningful feedback, and have lower revert rates.",
				},
				{
					kind: "p",
					text: "PR stacking addresses this by splitting a single feature branch into a dependency-ordered set of smaller review units. Earlier approaches produced linear chains: PR 1 → PR 2 → PR 3. This works when changes have a natural sequence, but real-world PRs often contain independent concerns — a schema migration and an unrelated UI refactor in the same branch. Forcing these into a single chain creates artificial review bottlenecks where PR 2 blocks on PR 1 even though they share no dependencies.",
				},
				{
					kind: "p",
					text: "The current algorithm builds a DAG (Directed Acyclic Graph) instead. Independent groups sit at the same level and can be reviewed and merged in parallel. Dependent groups maintain strict ordering. The hard constraint is correctness: the combined result of all stacked PRs must produce the exact same git tree as the original PR head. If splitting changes behavior, the tool has made things worse, not better.",
				},
			],
		},
		// ================================================================
		// Section 2: The Model
		// ================================================================
		{
			id: "model",
			title: "The DAG Model",
			blocks: [
				{
					kind: "p",
					text: "PR stacking is a transformation with a precise input and output. The input is a single pull request defined by a base SHA and a head SHA. The output is a set of draft PRs arranged in a DAG, where each draft PR modifies a subset of the original files. The top-level invariant is that the union of all leaf groups' trees must be byte-identical to the original head tree.",
				},
				{
					kind: "p",
					text: "The core data structures are `StackPlan` and `StackGroup`:",
				},
				{
					kind: "code",
					code: CODE_TYPES,
					caption: "src/stack/types.ts — Core plan types",
				},
				{
					kind: "p",
					text: "Each `StackGroup` declares its DAG parents via `deps`. A group with no dependencies targets the base SHA directly. A group with one or more dependencies targets those parent groups' commits. The `expected_trees` map stores the predicted tree SHA for each group — computed during planning and verified during execution.",
				},
				{
					kind: "p",
					text: "The `ancestor_sets` field stores the transitive closure of parent relationships for each group. Computing this is a BFS over the DAG parent graph:",
				},
				{
					kind: "code",
					code: CODE_ANCESTOR,
					caption: "src/stack/plan.ts — Transitive ancestor computation",
				},
				{
					kind: "p",
					text: "This transitive closure is critical for execution correctness. When constructing the git index for group G, the index must include not just G's own file changes, but all changes from every group in G's ancestor set. Without this, a group that depends on a schema change would be built against the old schema — producing a tree that silently diverges from expectations.",
				},
				{
					kind: "note",
					title: "Relation to prior work",
					text: "Shen et al. [4] describe a related graph-based approach in SmartCommit, which uses dependency graphs to decompose commits into activity-oriented groups. The newpr algorithm operates at pull request scope rather than commit scope: the granularity is file-level (not hunk-level), and the output is a materialized branch DAG with real git objects rather than advisory groupings.",
				},
			],
		},
		// ================================================================
		// Section 3: Symbol Flow Analysis
		// ================================================================
		{
			id: "symbol-flow",
			title: "Symbol Flow Analysis",
			blocks: [
				{
					kind: "p",
					text: "The first signal for dependency analysis is AST-level symbol flow. Given a set of changed files, the algorithm parses each file to extract its exports and imports, then resolves import specifiers to actual file paths within the changed file set.",
				},
				{
					kind: "p",
					text: "Parsing uses [meriyah](https://github.com/nicolo-ribaudo/meriyah-oxc), a fast ECMAScript parser, with a two-pass fallback strategy: first attempt with JSX support enabled, then without. If AST parsing fails entirely (syntax errors, non-JS files), a regex-based fallback extracts export and import declarations from the source text. This dual-mode approach means the algorithm degrades gracefully on files that aren't fully parseable.",
				},
				{
					kind: "p",
					text: "The output for each analyzable file is a `FileSymbols` record:",
				},
				{
					kind: "code",
					code: CODE_SYMBOLS,
					caption: "src/stack/symbol-flow.ts — Per-file symbol data",
				},
				{
					kind: "p",
					text: "Only relative imports (`./` and `../`) are considered. Third-party package imports don't create intra-PR dependencies. Each relative specifier is resolved through a candidate chain: try the path verbatim, then append each analyzable extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), then check for index files (`index.ts`, `index.tsx`, `index.js`):",
				},
				{
					kind: "code",
					code: CODE_RESOLVE,
					caption: "src/stack/symbol-flow.ts — Specifier resolution chain",
				},
				{
					kind: "p",
					text: "From file-level symbols, the algorithm builds two artifacts. First, a **symbol index**: a map from symbol name to the list of files that export it. Second, **group-level dependency edges**: if file A in group X imports a symbol from file B in group Y, that creates a dependency edge Y → X (Y must come before X). These edges feed directly into the constraint graph used for topological ordering.",
				},
				{
					kind: "p",
					text: "The import dependency analysis (`analyzeImportDeps`) also builds a separate file-level dependency graph. This graph captures the raw import relationships before group assignment and serves as input to the confidence scorer for validating AI-generated group assignments.",
				},
			],
		},
		// ================================================================
		// Section 4: Confidence Scoring
		// ================================================================
		{
			id: "confidence",
			title: "Confidence Scoring",
			blocks: [
				{
					kind: "p",
					text: "File-to-group assignment initially comes from AI classification — an LLM assigns each changed file to a concern group based on file paths, summaries, and commit messages. But LLM outputs are probabilistic and can misclassify files. Confidence scoring validates and corrects these assignments using four independent signals, each weighted by its reliability as a grouping indicator.",
				},
				{
					kind: "code",
					code: CODE_CONFIDENCE,
					caption: "src/stack/confidence-score.ts — Score breakdown and thresholds",
				},
				{
					kind: "p",
					text: "**Import affinity (weight 0.4)** is the strongest signal. It measures how many import/export relationships exist between the candidate file and the group's existing files. Both directions count: the file importing from the group, and the group's files importing from the file. The score is computed as `min(1, totalImportLinks / 3)` — a file with import connections to 3+ group members saturates this signal.",
				},
				{
					kind: "p",
					text: "**Directory proximity (weight 0.3)** counts shared path prefix segments between the file and each group member, normalized by 4 segments. A file at `src/api/auth/login.ts` scores 0.75 against a group containing `src/api/auth/middleware.ts` (3 shared segments out of 4). This captures the convention that related files tend to live in the same directory subtree.",
				},
				{
					kind: "p",
					text: "**Symbol overlap (weight 0.2)** checks whether the file's exported symbols are actually imported by group members, or vice versa. This catches cases where files share a directory but serve unrelated concerns — a utility function in `src/api/` that's only used by the UI layer shouldn't be grouped with API handlers.",
				},
				{
					kind: "p",
					text: "**Co-change frequency (weight 0.1)** uses git history as a behavioral signal. The algorithm scans up to 200 recent commits and builds pairwise co-change counts: how often does file A appear in the same commit as file B? Files that historically change together are more likely to belong to the same concern. This is the weakest signal because co-change can be coincidental, but it provides useful tiebreaking information.",
				},
				{
					kind: "p",
					text: "A **layer bonus** (up to +0.3) rewards same-layer classification. Files are classified into architectural layers — schema, codegen, core, integration, UI, test — using path patterns and symbol count heuristics. A file with many exports but few imports is likely a schema/types layer. A file with many imports but few exports is likely an integration/wiring layer. If the file's inferred layer matches the group's dominant layer, the bonus applies (0.3 for exact match, 0.1 for adjacent layers).",
				},
				{
					kind: "p",
					text: "Reassignment fires when three conditions hold: the file's best-scoring group differs from its current assignment, the best score exceeds `REASSIGN_THRESHOLD` (0.25), and the margin over the current group's score exceeds `MIN_ADVANTAGE` (0.15). These thresholds prevent churn from marginal score differences — a file is only moved when there's clear evidence it belongs elsewhere.",
				},
				{
					kind: "note",
					title: "Why multiple signals?",
					text: "No single signal is reliable enough on its own. Import analysis misses files that are related by convention rather than direct import. Directory proximity fails when a directory contains files serving different concerns. Co-change can be noisy. The weighted combination produces robust assignments that degrade gracefully when any individual signal is weak or missing. This multi-signal approach is consistent with empirical findings on dependency detection — RefExpo [7] demonstrates that combining structural, behavioral, and semantic signals significantly improves dependency graph accuracy.",
				},
			],
		},
		// ================================================================
		// Section 5: Cycle Resolution
		// ================================================================
		{
			id: "cycles",
			title: "Constraint Graph and Cycle Resolution",
			blocks: [
				{
					kind: "p",
					text: "With file ownership established and group-level dependencies computed, the algorithm must prove that the groups can form a valid DAG — that is, find a topological ordering where every constraint edge points forward. The constraint graph has two types of edges.",
				},
				{
					kind: "code",
					code: CODE_CONSTRAINT,
					caption: "src/stack/types.ts — Constraint edge types",
				},
				{
					kind: "p",
					text: "**Path-order edges** arise when the same file is modified by commits belonging to different groups. If file F is first touched in a commit assigned to group A, then later touched in a commit assigned to group B, a path-order edge A → B is created. The algorithm collapses consecutive same-group edits (if A touches F twice, then B touches it, only one edge A → B is emitted). This captures the temporal ordering implied by the commit history — the group that last modified a file should appear later in the stack so its changes take precedence.",
				},
				{
					kind: "p",
					text: "**Dependency edges** come from import analysis. If group X imports symbols defined in group Y, then Y must precede X in the topological order. An edge Y → X is created. These are stronger signals than path-order edges because they represent genuine code-level dependencies — group X literally cannot compile or function correctly without group Y's changes being present.",
				},
				{
					kind: "p",
					text: "Cycles occur when these constraints contradict each other. Group A might import from group B (dependency edge B → A), while the commit history shows A's file was touched first (path-order edge A → B). This creates a cycle: A → B → A. A hard failure here would be unacceptable — it would mean the tool can't stack a valid PR simply because the developer happened to commit in a particular order.",
				},
				{
					kind: "p",
					text: "The algorithm resolves cycles through greedy edge removal rather than hard failure. This approach is inspired by cycle-breaking techniques used in Dependency Structure Matrices (DSMs) for resolving cyclic package dependencies [5]:",
				},
				{
					kind: "code",
					code: CODE_CYCLE,
					caption: "src/stack/feasibility.ts — Greedy cycle breaking",
				},
				{
					kind: "p",
					text: "Edges are sorted by kind priority: path-order edges first (they're weaker signals), then dependency edges. The algorithm adds edges one at a time, running cycle detection after each addition. If adding an edge creates a cycle, it's dropped. The result is a maximal acyclic subgraph — the largest subset of constraints that doesn't contain cycles.",
				},
				{
					kind: "p",
					text: "Cycle detection uses DFS with three-color marking (white → gray → black). A back edge to a gray node indicates a cycle. This runs in O(V + E) per check, and since the number of groups is typically small (< 10), the overall cycle-breaking cost is negligible.",
				},
				{
					kind: "p",
					text: "After cycle resolution, Kahn's algorithm produces the final topological sort. Ties (nodes with equal in-degree becoming available simultaneously) are broken by earliest commit date — groups whose files were touched first in the commit history come first in the stack. This heuristic produces orderings that typically match developer intent: foundational changes (types, schemas) naturally appear before the code that consumes them.",
				},
			],
		},
		// ================================================================
		// Section 6: Execution and Verification
		// ================================================================
		{
			id: "execution",
			title: "Execution and Tree Equivalence",
			blocks: [
				{
					kind: "p",
					text: "With a valid DAG plan, execution materializes the actual git branch and commit structure. Each group gets its own branch and commit, and the DAG relationships become multi-parent commit links in git's object graph.",
				},
				{
					kind: "p",
					text: "The process starts by creating one git index per group, each initialized to the base tree via `git read-tree`. For DAGs with multiple leaf nodes (groups that nothing depends on), an additional all-changes index is created to track the complete union of all modifications.",
				},
				{
					kind: "p",
					text: "Then, for each commit in the original PR's delta sequence, file changes are applied to the appropriate indexes. A change to file F owned by group G is applied to: (1) G's index, and (2) every index whose group has G in its ancestor set. This is what makes ancestor sets critical — without them, downstream groups would miss prerequisite changes.",
				},
				{
					kind: "p",
					text: "For each group in topological order, the algorithm writes the index to a tree object, then creates a commit using `git commit-tree` with explicit parent arguments:",
				},
				{
					kind: "code",
					code: CODE_COMMIT,
					caption: "src/stack/execute.ts — Multi-parent commit creation",
				},
				{
					kind: "p",
					text: "Groups with no DAG dependencies use the base SHA as their single parent. Groups with dependencies list their direct parent groups' commit SHAs as `-p` arguments. This produces a genuine DAG in git's commit graph — `git log --graph` displays the branching and merging structure. Each branch is named with a structured pattern: `newpr-stack/pr-{N}/{source}/{order}-{type}-{topic}-{random}`.",
				},
				{
					kind: "p",
					text: "Verification runs three independent checks after execution completes:",
				},
				{
					kind: "p",
					text: "**Scope check** — For each group's commit, compute the diff against its DAG parent(s). Every file in the diff should be owned by that group. Files from other groups appearing in the diff indicate a leak in index construction. For groups with multiple DAG parents, verification synthesizes a merge tree from those parents to serve as the diff base.",
				},
				{
					kind: "p",
					text: "**Completeness check** — Compare the union of all group diffs against the original PR diff. Every file changed in the original PR must appear in exactly one group's diff, and no group may contain files not present in the original diff. Missing files mean the decomposition lost changes; extra files mean it introduced changes.",
				},
				{
					kind: "p",
					text: "**Tree equivalence** — The final and most critical check. For linear stacks, the top group's tree is compared against the original HEAD tree. For multi-leaf DAGs, the all-changes index provides the union tree. The SHA-1 comparison is exact:",
				},
				{
					kind: "code",
					code: CODE_VERIFY,
					caption: "src/stack/verify.ts — The byte-identity invariant",
				},
				{
					kind: "p",
					text: "If `final_tree_sha` does not match the HEAD tree, execution is a hard failure. The stacked branches are deleted and the error is reported with both SHA values for debugging. This is the invariant that makes PR stacking safe — no amount of clever decomposition matters if the end result differs from what the developer wrote.",
				},
			],
		},
		// ================================================================
		// Section 7: Pipeline Reference
		// ================================================================
		{
			id: "pipeline",
			title: "Pipeline Reference",
			blocks: [
				{
					kind: "p",
					text: "The full stacking pipeline chains the modules described above into a 9-phase sequence. Each phase is a pure function of its inputs (plus git plumbing calls), making the pipeline deterministic for a given repository state.",
				},
				{
					kind: "code",
					code: CODE_PIPELINE,
					caption: "Phase sequence (each arrow is a function boundary)",
				},
				{
					kind: "p",
					text: "**Phase 1 — Context Capture.** Fetch PR metadata, verify base/head SHAs exist locally, force fetch if missing. Output: deterministic workspace snapshot.",
				},
				{
					kind: "p",
					text: "**Phase 2 — Delta Extraction.** Build normalized change deltas from `git diff-tree` between base and head. Each delta carries file-level blob SHAs, mode changes, and rename tracking. Output: array of `DeltaEntry` objects.",
				},
				{
					kind: "p",
					text: "**Phase 3 — Symbol Flow & Import Analysis.** Parse each changed file's AST (meriyah), extract exports/imports, resolve specifiers, build file→file and group→group dependency edges. Output: `FileSymbols` map and `ImportDepResult`.",
				},
				{
					kind: "p",
					text: "**Phase 4 — Partition.** Detect ambiguous (multi-group) and unassigned files. Use LLM to resolve assignments. Validate with confidence scoring. Apply reassignments where scores indicate misclassification. Output: ownership map with warnings.",
				},
				{
					kind: "p",
					text: "**Phase 5 — Coupling, Split & Rebalance.** Apply atomic coupling rules (lockfile + package.json must stay together). Split groups exceeding 8 files using LLM-guided decomposition. Rebalance when any group exceeds 3× the median size. Merge groups reduced to zero files. Incorporate co-change signals from git history. Output: refined group set.",
				},
				{
					kind: "p",
					text: "**Phase 6 — Feasibility & Cycle Resolution.** Build constraint graph (path-order + dependency edges). Detect and break cycles via greedy edge removal. Topologically sort with commit-date tiebreaking. Output: group ordering and DAG edge set, or diagnostic failure.",
				},
				{
					kind: "p",
					text: "**Phase 7 — DAG Plan.** Compute DAG parents, ancestor sets, per-group git indexes, and expected tree SHAs. Output: `StackPlan` with deterministic tree predictions.",
				},
				{
					kind: "p",
					text: "**Phase 8 — Execution.** Materialize branches and multi-parent commits. Apply file deltas to per-group indexes respecting ancestor sets. Write tree objects, create commits with `git commit-tree`. For multi-leaf DAGs, maintain all-changes index. Output: `StackExecResult` with commit SHAs and branch names.",
				},
				{
					kind: "p",
					text: "**Phase 9 — Verification.** Run scope, completeness, and tree equivalence checks. If tree equivalence fails, the entire execution is rolled back (branches deleted, refs cleaned). Output: verified result or hard failure.",
				},
			],
		},
	],
	references: [
		{
			id: "1",
			text: "Sadowski, C., Söderberg, E., Church, L., Sipko, M., & Bacchelli, A. (2018). Modern Code Review: A Case Study at Google. In Proceedings of the 40th International Conference on Software Engineering (ICSE '18). ACM.",
			url: "https://doi.org/10.1145/3183519.3183525",
		},
		{
			id: "2",
			text: "di Biase, M., Bruntink, M., & van Deursen, A. (2020). The effects of change decomposition on code review — a controlled experiment. PeerJ Computer Science, 6, e289.",
			url: "https://doi.org/10.7717/peerj-cs.289",
		},
		{
			id: "3",
			text: "Kudrjavets, G., Nagappan, N., & Ball, T. (2022). Do Small Code Changes Merge Faster? A Multi-Language Empirical Investigation. arXiv:2211.05668.",
			url: "https://arxiv.org/abs/2211.05668",
		},
		{
			id: "4",
			text: "Shen, B., Zhang, W., Zhao, H., Liang, G., Jin, Z., & Wang, Q. (2021). SmartCommit: A Graph-Based Interactive Assistant for Activity-Oriented Commits. In Proceedings of the 29th ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering (ESEC/FSE '21).",
			url: "https://doi.org/10.1145/3468264.3468551",
		},
		{
			id: "5",
			text: "Laval, J. & Ducasse, S. Resolving Cyclic Dependencies between Packages with Enriched Dependency Structural Matrix. Software: Practice and Experience.",
			url: "https://doi.org/10.1002/spe.2220",
		},
		{
			id: "6",
			text: "Propel. Code Review Analytics: PR Size and Defect Correlation (internal study, 50K+ PRs analyzed).",
		},
		{
			id: "7",
			text: "Haratian, A., Tajalli, S., & Izadi, M. (2024). RefExpo: Unveiling Software Project Structures through Advanced Dependency Graph Extraction. arXiv:2501.00958.",
			url: "https://arxiv.org/abs/2501.00958",
		},
	],
};

// ============================================================================
// KO Content
// ============================================================================

const KO_CONTENT: ArticleContent = {
	htmlLang: "ko",
	pageTitle: "PR Stacking 동작 원리",
	badge: "엔지니어링 딥다이브",
	title: "PR Stacking 동작 원리",
	subtitle:
		"newpr가 단일 Pull Request를 AST 기반 심볼 플로우 분석, 다중 시그널 신뢰도 스코어링, 탐욕적 순환 해소를 통해 바이트 동일한 트리 출력을 보장하면서 DAG 구조의 Draft PR들로 분해하는 과정을 기술합니다.",
	updated: "v1.0.23 기준",
	readingTime: "약 15분",
	homeLabel: "소개 페이지로 돌아가기",
	langSwitchLabel: "EN",
	langSwitchPath: "/newpr/stacking-principles.html",
	ctaLabel: "newpr 사용해보기",
	ctaPath: "https://github.com/jiwonMe/newpr",
	referencesTitle: "참고문헌",
	closingTitle: "요약",
	closingParagraph:
		"PR stacking은 정합성이 보장되는 DAG 변환입니다. 입력은 하나의 대형 리뷰 단위이고, 출력은 독립 관심사가 병렬 리뷰될 수 있고 의존 관심사는 올바른 머지 순서를 유지하는 여러 개의 작은 리뷰 단위입니다. 최종 트리의 바이트 동일성이라는 불변식이 변환의 안전성을 보장합니다. 파이프라인의 나머지 모든 단계 — 심볼 플로우, 신뢰도 스코어링, 순환 해소, 검증 — 는 이 불변식을 달성 가능하게 만들기 위해 존재합니다.",
	articleSections: [
		// ================================================================
		// Section 1: 문제
		// ================================================================
		{
			id: "problem",
			title: "문제 정의",
			blocks: [
				{
					kind: "p",
					text: "대형 Pull Request가 리뷰에서 실패하는 방식은 예측 가능하고, 이미 충분히 연구되어 있습니다. 수백 줄을 넘어가면 리뷰어는 설계 의도를 이해하려는 시도를 멈추고 표면적인 실수를 찾는 것으로 전환합니다. 결과적으로 타이포는 잡지만 설계 결함은 놓치는 리뷰가 됩니다.",
				},
				{
					kind: "p",
					text: "Sadowski et al. [1]은 구글에서 9백만 건 이상의 코드 변경을 연구하여 작고 집중된 변경이 더 빠르고 철저한 리뷰를 받는다는 것을 확인했습니다. Propel 연구 [6]는 5만 건 이상의 PR을 분석해 200–400줄 범위의 PR이 대형 PR 대비 머지 후 결함이 40% 적고, 1,000줄 이상의 PR은 결함 탐지율이 70% 하락한다고 보고했습니다.",
				},
				{
					kind: "p",
					text: "di Biase et al. [2]는 통제 실험을 통해 변경을 리뷰 전에 분해하면 리뷰 성과가 유의미하게 개선된다는 것을 확인했습니다. 리뷰어는 변경이 집중되어 있을 때 더 많은 결함을 발견하고 더 높은 품질의 피드백을 제공합니다. Kudrjavets et al. [3]은 이를 여러 프로그래밍 언어에 걸쳐 관찰했습니다: 작은 변경은 더 빨리 머지되고, 더 의미 있는 피드백을 받으며, revert 비율이 낮습니다.",
				},
				{
					kind: "p",
					text: "PR stacking은 하나의 feature 브랜치를 의존성 순서로 정렬된 작은 리뷰 단위들로 나누어 이 문제를 해결합니다. 이전 접근법은 선형 체인을 생성했습니다: PR 1 → PR 2 → PR 3. 변경이 자연스러운 순서를 가질 때는 동작하지만, 실제 PR에는 독립적인 관심사가 함께 존재하는 경우가 많습니다 — 같은 브랜치에 스키마 마이그레이션과 무관한 UI 리팩토링이 공존하는 경우가 대표적입니다. 이를 하나의 체인으로 강제하면 의존 관계가 없는데도 PR 2가 PR 1에 블록되는 인위적인 병목이 발생합니다.",
				},
				{
					kind: "p",
					text: "현재 알고리즘은 DAG(Directed Acyclic Graph)를 생성합니다. 독립 그룹은 같은 레벨에 위치하여 병렬로 리뷰·머지할 수 있고, 의존 그룹은 엄격한 순서를 유지합니다. 핵심 제약은 정확성입니다: 모든 스택 PR의 결합 결과가 원본 PR head와 동일한 git 트리를 생성해야 합니다. 분할이 동작을 변경한다면, 도구는 개선이 아니라 악화를 초래한 것입니다.",
				},
			],
		},
		// ================================================================
		// Section 2: DAG 모델
		// ================================================================
		{
			id: "model",
			title: "DAG 모델",
			blocks: [
				{
					kind: "p",
					text: "PR stacking은 입력과 출력이 명확한 변환입니다. 입력은 base SHA와 head SHA로 정의된 단일 Pull Request이고, 출력은 DAG로 배열된 Draft PR의 집합입니다. 각 Draft PR은 원본 파일의 부분집합을 수정하며, 최상위 불변식은 모든 leaf 그룹 트리의 합집합이 원본 head 트리와 바이트 동일해야 한다는 것입니다.",
				},
				{
					kind: "p",
					text: "핵심 데이터 구조는 `StackPlan`과 `StackGroup`입니다:",
				},
				{
					kind: "code",
					code: CODE_TYPES,
					caption: "src/stack/types.ts — 핵심 플랜 타입",
				},
				{
					kind: "p",
					text: "각 `StackGroup`은 `deps`를 통해 DAG 부모를 선언합니다. 의존이 없는 그룹은 base SHA를 직접 타겟하고, 하나 이상의 의존이 있는 그룹은 해당 부모 그룹의 커밋을 타겟합니다. `expected_trees` 맵은 각 그룹의 예측 트리 SHA를 저장하며, 이는 계획 단계에서 계산되고 실행 단계에서 검증됩니다.",
				},
				{
					kind: "p",
					text: "`ancestor_sets` 필드는 각 그룹에 대한 부모 관계의 전이적 폐포(transitive closure)를 저장합니다. 이를 계산하는 것은 DAG 부모 그래프에 대한 BFS입니다:",
				},
				{
					kind: "code",
					code: CODE_ANCESTOR,
					caption: "src/stack/plan.ts — 전이적 조상 계산",
				},
				{
					kind: "p",
					text: "이 전이적 폐포는 실행 정확성에 결정적입니다. 그룹 G의 git index를 구성할 때, index에는 G 자체의 파일 변경뿐 아니라 G의 ancestor set에 있는 모든 그룹의 변경이 포함되어야 합니다. 이것이 없으면 스키마 변경에 의존하는 그룹이 구(舊) 스키마 위에 구축되어, 기대와 조용히 달라지는 트리를 생성합니다.",
				},
				{
					kind: "note",
					title: "선행 연구와의 관계",
					text: "Shen et al. [4]는 SmartCommit에서 관련된 그래프 기반 접근법을 기술합니다. SmartCommit은 의존성 그래프를 사용해 커밋을 활동 중심 그룹으로 분해합니다. newpr 알고리즘은 커밋이 아닌 Pull Request 범위에서 동작하며, 세분도는 hunk가 아닌 파일 수준이고, 출력은 권고적 그룹핑이 아닌 실제 git 객체가 포함된 브랜치 DAG입니다.",
				},
			],
		},
		// ================================================================
		// Section 3: 심볼 플로우 분석
		// ================================================================
		{
			id: "symbol-flow",
			title: "심볼 플로우 분석",
			blocks: [
				{
					kind: "p",
					text: "의존성 분석의 첫 번째 시그널은 AST 수준의 심볼 플로우입니다. 변경된 파일 집합이 주어지면, 알고리즘은 각 파일을 파싱하여 export와 import를 추출한 뒤, import specifier를 변경 파일 집합 내의 실제 파일 경로로 resolve합니다.",
				},
				{
					kind: "p",
					text: "파싱은 빠른 ECMAScript 파서인 [meriyah](https://github.com/nicolo-ribaudo/meriyah-oxc)를 사용하며, 2단계 폴백 전략을 적용합니다: 먼저 JSX 지원을 켜고 시도, 실패하면 끄고 재시도. AST 파싱이 완전히 실패하면(구문 오류, 비JS 파일) regex 기반 폴백이 소스 텍스트에서 export/import 선언을 추출합니다. 이 이중 모드 접근법으로 완전히 파싱할 수 없는 파일에서도 알고리즘이 우아하게 성능 저하됩니다.",
				},
				{
					kind: "p",
					text: "분석 가능한 각 파일의 출력은 `FileSymbols` 레코드입니다:",
				},
				{
					kind: "code",
					code: CODE_SYMBOLS,
					caption: "src/stack/symbol-flow.ts — 파일별 심볼 데이터",
				},
				{
					kind: "p",
					text: "상대 경로 import(`./`와 `../`)만 고려합니다. 서드파티 패키지 import는 PR 내부 의존성을 생성하지 않습니다. 각 상대 specifier는 후보 체인을 통해 resolve됩니다: 경로 그대로 시도, 분석 가능한 확장자 추가(`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), index 파일 확인(`index.ts`, `index.tsx`, `index.js`):",
				},
				{
					kind: "code",
					code: CODE_RESOLVE,
					caption: "src/stack/symbol-flow.ts — Specifier 해석 체인",
				},
				{
					kind: "p",
					text: "파일 수준 심볼로부터 두 가지 결과물을 구축합니다. 첫째, **심볼 인덱스**: 심볼 이름에서 해당 심볼을 export하는 파일 목록으로의 맵. 둘째, **그룹 수준 의존 edge**: 그룹 X의 파일 A가 그룹 Y의 파일 B에서 심볼을 import하면, Y → X 의존 edge가 생성됩니다(Y가 X보다 앞에 와야 함). 이 edge들은 위상 정렬에 사용되는 제약 그래프에 직접 입력됩니다.",
				},
				{
					kind: "p",
					text: "import 의존성 분석(`analyzeImportDeps`)은 별도의 파일 수준 의존 그래프도 구축합니다. 이 그래프는 그룹 배치 이전의 원시 import 관계를 캡처하며, AI가 생성한 그룹 배치를 검증하기 위한 신뢰도 스코어러의 입력이 됩니다.",
				},
			],
		},
		// ================================================================
		// Section 4: 신뢰도 스코어링
		// ================================================================
		{
			id: "confidence",
			title: "신뢰도 스코어링",
			blocks: [
				{
					kind: "p",
					text: "파일-그룹 배치는 초기에 AI 분류에서 생성됩니다 — LLM이 파일 경로, 요약, 커밋 메시지를 기반으로 각 변경 파일을 관심사 그룹에 배치합니다. 그러나 LLM 출력은 확률적이며 오분류가 발생할 수 있습니다. 신뢰도 스코어링은 각각의 신뢰도가 다른 네 가지 독립 시그널을 사용하여 이 배치를 검증하고 교정합니다.",
				},
				{
					kind: "code",
					code: CODE_CONFIDENCE,
					caption: "src/stack/confidence-score.ts — 점수 구성과 임계값",
				},
				{
					kind: "p",
					text: "**Import 친화도 (가중치 0.4)**가 가장 강력한 시그널입니다. 후보 파일과 그룹의 기존 파일 사이에 존재하는 import/export 관계의 수를 측정합니다. 양방향 모두 계산: 파일이 그룹에서 import하는 것과, 그룹의 파일이 해당 파일에서 import하는 것. 점수는 `min(1, totalImportLinks / 3)`으로 계산되어, 그룹 멤버 3개 이상과 import 연결이 있으면 이 시그널이 포화됩니다.",
				},
				{
					kind: "p",
					text: "**디렉토리 근접도 (가중치 0.3)**는 파일과 각 그룹 멤버 사이의 공유 경로 접두사 세그먼트 수를 세고, 4 세그먼트로 정규화합니다. `src/api/auth/login.ts`는 `src/api/auth/middleware.ts`를 포함한 그룹에 대해 0.75를 받습니다(공유 세그먼트 3개 / 4). 관련 파일은 같은 디렉토리 하위 트리에 있는 경향이 있다는 관례를 반영합니다.",
				},
				{
					kind: "p",
					text: "**심볼 겹침 (가중치 0.2)**은 파일의 export된 심볼이 그룹 멤버에 의해 실제로 import되는지(또는 반대)를 확인합니다. 같은 디렉토리를 공유하지만 다른 관심사를 제공하는 파일을 걸러냅니다 — `src/api/`에 있지만 UI 레이어에서만 사용되는 유틸리티 함수는 API 핸들러와 그룹화되어서는 안 됩니다.",
				},
				{
					kind: "p",
					text: "**Co-change 빈도 (가중치 0.1)**는 git 히스토리를 행동적 시그널로 사용합니다. 알고리즘은 최근 200개 커밋까지 스캔하여 쌍별 co-change 카운트를 구축합니다: 파일 A가 파일 B와 같은 커밋에 얼마나 자주 등장하는가? 역사적으로 함께 변경되는 파일은 같은 관심사에 속할 가능성이 높습니다. co-change는 우연일 수 있어 가장 약한 시그널이지만, 유용한 타이브레이킹 정보를 제공합니다.",
				},
				{
					kind: "p",
					text: "**레이어 보너스** (최대 +0.3)는 같은 아키텍처 레이어 분류를 보상합니다. 파일은 경로 패턴과 심볼 수 휴리스틱으로 schema, codegen, core, integration, UI, test 레이어로 분류됩니다. export가 많고 import가 적은 파일은 schema/types 레이어일 가능성이 높고, import가 많고 export가 적은 파일은 integration/wiring 레이어일 가능성이 높습니다. 파일의 추론된 레이어가 그룹의 지배적 레이어와 일치하면 보너스가 적용됩니다(정확 일치 0.3, 인접 레이어 0.1).",
				},
				{
					kind: "p",
					text: "재배치는 세 조건이 모두 충족될 때 발동합니다: 파일의 최고 점수 그룹이 현재 배치와 다르고, 최고 점수가 `REASSIGN_THRESHOLD`(0.25)를 초과하고, 현재 그룹 점수와의 차이가 `MIN_ADVANTAGE`(0.15)를 초과해야 합니다. 이 임계값들은 한계적 점수 차이로 인한 불필요한 변동을 방지합니다 — 파일이 다른 곳에 속한다는 명확한 증거가 있을 때만 이동됩니다.",
				},
				{
					kind: "note",
					title: "왜 다중 시그널인가?",
					text: "단일 시그널만으로는 충분히 신뢰할 수 없습니다. Import 분석은 직접 import가 아닌 관례로 연관된 파일을 놓칩니다. 디렉토리 근접도는 하나의 디렉토리에 다른 관심사의 파일이 섞여 있으면 실패합니다. Co-change는 노이즈가 있을 수 있습니다. 가중 조합은 개별 시그널이 약하거나 누락되어도 우아하게 성능이 저하되는 견고한 배치를 생성합니다. 이 다중 시그널 접근법은 의존성 탐지에 대한 실증적 발견과 일치합니다 — RefExpo [7]는 구조적, 행동적, 의미적 시그널을 결합하면 의존성 그래프 정확도가 유의미하게 향상됨을 보여줍니다.",
				},
			],
		},
		// ================================================================
		// Section 5: 순환 해소
		// ================================================================
		{
			id: "cycles",
			title: "제약 그래프와 순환 해소",
			blocks: [
				{
					kind: "p",
					text: "파일 ownership이 확립되고 그룹 수준 의존성이 계산되면, 알고리즘은 그룹들이 유효한 DAG를 형성할 수 있음을 증명해야 합니다 — 즉, 모든 제약 edge가 전방을 가리키는 위상 정렬을 찾아야 합니다. 제약 그래프에는 두 종류의 edge가 있습니다.",
				},
				{
					kind: "code",
					code: CODE_CONSTRAINT,
					caption: "src/stack/types.ts — 제약 edge 타입",
				},
				{
					kind: "p",
					text: "**Path-order edge**는 같은 파일이 서로 다른 그룹에 속하는 커밋에 의해 수정될 때 발생합니다. 파일 F가 그룹 A에 배치된 커밋에서 먼저 수정되고, 이후 그룹 B에 배치된 커밋에서 수정되면, path-order edge A → B가 생성됩니다. 연속된 같은 그룹 수정은 축약됩니다(A가 F를 두 번 수정 후 B가 수정하면 edge는 A → B 하나만). 이는 커밋 히스토리가 함축하는 시간적 순서를 포착합니다.",
				},
				{
					kind: "p",
					text: "**Dependency edge**는 import 분석에서 생성됩니다. 그룹 X가 그룹 Y에서 정의된 심볼을 import하면, Y가 위상 순서에서 X보다 앞에 와야 합니다. Y → X edge가 생성됩니다. 이들은 path-order edge보다 강한 시그널입니다 — 실제 코드 수준 의존성을 나타내므로, 그룹 X는 그룹 Y의 변경 없이는 컴파일되거나 올바르게 동작할 수 없습니다.",
				},
				{
					kind: "p",
					text: "이 제약들이 서로 모순되면 순환이 발생합니다. 그룹 A가 그룹 B에서 import하고(dependency edge B → A), 커밋 히스토리에서 A의 파일이 먼저 수정되면(path-order edge A → B), 순환이 됩니다: A → B → A. 여기서 하드 실패는 받아들일 수 없습니다 — 개발자가 특정 순서로 커밋했다는 이유만으로 유효한 PR을 스택할 수 없다는 뜻이 되기 때문입니다.",
				},
				{
					kind: "p",
					text: "알고리즘은 하드 실패 대신 탐욕적 edge 제거를 통해 순환을 해소합니다. 이 접근법은 Dependency Structure Matrix(DSM)에서 순환 패키지 의존성을 해소하는 기법[5]에서 영감을 받았습니다:",
				},
				{
					kind: "code",
					code: CODE_CYCLE,
					caption: "src/stack/feasibility.ts — 탐욕적 순환 해소",
				},
				{
					kind: "p",
					text: "Edge는 종류 우선순위로 정렬됩니다: path-order edge가 먼저(약한 시그널), 그 다음 dependency edge. 알고리즘은 edge를 하나씩 추가하면서 매 추가 후 순환 탐지를 실행합니다. edge 추가가 순환을 만들면 해당 edge를 버립니다. 결과는 최대 비순환 부분 그래프 — 순환을 포함하지 않는 제약의 최대 부분집합입니다.",
				},
				{
					kind: "p",
					text: "순환 탐지는 3색 마킹 DFS(white → gray → black)를 사용합니다. gray 노드로의 back edge가 순환을 나타냅니다. 매 체크에 O(V + E)이며, 그룹 수가 일반적으로 적으므로(< 10) 전체 순환 해소 비용은 무시할 만합니다.",
				},
				{
					kind: "p",
					text: "순환 해소 후 Kahn 알고리즘이 최종 위상 정렬을 생성합니다. 동시에 사용 가능해지는 노드(동일 in-degree) 간 타이브레이킹은 가장 이른 커밋 날짜로 수행됩니다 — 커밋 히스토리에서 파일이 먼저 수정된 그룹이 스택에서 앞에 옵니다. 이 휴리스틱은 개발자 의도에 일반적으로 부합하는 순서를 생성합니다: 기반 변경(타입, 스키마)이 자연스럽게 이를 소비하는 코드보다 앞에 나타납니다.",
				},
			],
		},
		// ================================================================
		// Section 6: 실행과 검증
		// ================================================================
		{
			id: "execution",
			title: "실행과 트리 동일성",
			blocks: [
				{
					kind: "p",
					text: "유효한 DAG 플랜이 있으면, 실행 단계에서 실제 git 브랜치와 커밋 구조를 생성합니다. 각 그룹은 자체 브랜치와 커밋을 갖고, DAG 관계는 git의 오브젝트 그래프에서 multi-parent 커밋 링크가 됩니다.",
				},
				{
					kind: "p",
					text: "과정은 그룹당 하나의 git index를 생성하고 각각 `git read-tree`로 base 트리를 초기화하는 것으로 시작합니다. 여러 leaf 노드가 있는 DAG(어떤 그룹에도 의존되지 않는 그룹이 여럿)의 경우, 모든 수정의 합집합을 추적하기 위한 추가 all-changes index가 생성됩니다.",
				},
				{
					kind: "p",
					text: "그런 다음 원본 PR 델타 시퀀스의 각 커밋에 대해 파일 변경이 적절한 index들에 적용됩니다. 그룹 G가 소유한 파일 F의 변경은 (1) G의 index와 (2) G를 ancestor set에 포함하는 모든 그룹의 index에 적용됩니다. 이것이 ancestor set이 결정적인 이유입니다 — 없으면 하류 그룹이 선행 변경을 누락합니다.",
				},
				{
					kind: "p",
					text: "위상 순서대로 각 그룹에 대해 알고리즘은 index를 트리 오브젝트로 기록한 다음, 명시적 parent 인자와 함께 `git commit-tree`로 커밋을 생성합니다:",
				},
				{
					kind: "code",
					code: CODE_COMMIT,
					caption: "src/stack/execute.ts — Multi-parent 커밋 생성",
				},
				{
					kind: "p",
					text: "DAG 의존이 없는 그룹은 base SHA를 단일 parent로 사용합니다. 의존이 있는 그룹은 직접 부모 그룹의 커밋 SHA들을 `-p` 인자로 나열합니다. 이는 git의 커밋 그래프에 실제 DAG를 생성합니다 — `git log --graph`가 분기와 병합 구조를 표시합니다. 각 브랜치는 구조화된 패턴으로 명명됩니다: `newpr-stack/pr-{N}/{source}/{order}-{type}-{topic}-{random}`.",
				},
				{
					kind: "p",
					text: "실행 완료 후 검증이 세 가지 독립적인 체크를 수행합니다:",
				},
				{
					kind: "p",
					text: "**범위 체크** — 각 그룹 커밋에 대해 DAG 부모 대비 diff를 계산합니다. diff의 모든 파일은 해당 그룹 소유여야 합니다. 다른 그룹의 파일이 diff에 나타나면 index 구성의 누수를 의미합니다. 여러 DAG 부모를 가진 그룹은 부모들로부터 합성 merge 트리를 만들어 diff 기준으로 사용합니다.",
				},
				{
					kind: "p",
					text: "**완전성 체크** — 모든 그룹 diff의 합집합을 원본 PR diff와 비교합니다. 원본 PR에서 변경된 모든 파일이 정확히 하나의 그룹 diff에 나타나야 하고, 어떤 그룹도 원본 diff에 없는 파일을 포함해서는 안 됩니다.",
				},
				{
					kind: "p",
					text: "**트리 동일성** — 최종적이고 가장 중요한 체크입니다. 선형 스택에서는 최상위 그룹의 트리를 원본 HEAD 트리와 비교합니다. Multi-leaf DAG에서는 all-changes index가 합집합 트리를 제공합니다. SHA-1 비교는 정확합니다:",
				},
				{
					kind: "code",
					code: CODE_VERIFY,
					caption: "src/stack/verify.ts — 바이트 동일성 불변식",
				},
				{
					kind: "p",
					text: "`final_tree_sha`가 HEAD 트리와 일치하지 않으면 실행은 하드 실패입니다. 스택 브랜치는 삭제되고 디버깅을 위해 양쪽 SHA 값과 함께 에러가 보고됩니다. 이것이 PR stacking을 안전하게 만드는 불변식입니다 — 아무리 교묘한 분해를 하더라도 최종 결과가 개발자가 작성한 것과 다르면 의미가 없습니다.",
				},
			],
		},
		// ================================================================
		// Section 7: 파이프라인 참조
		// ================================================================
		{
			id: "pipeline",
			title: "파이프라인 참조",
			blocks: [
				{
					kind: "p",
					text: "전체 스택 파이프라인은 위에서 설명한 모듈들을 9단계 시퀀스로 체이닝합니다. 각 단계는 입력(+ git plumbing 호출)의 순수 함수이므로, 주어진 저장소 상태에서 파이프라인은 결정적입니다.",
				},
				{
					kind: "code",
					code: CODE_PIPELINE,
					caption: "단계 시퀀스 (각 화살표는 함수 경계)",
				},
				{
					kind: "p",
					text: "**Phase 1 — 컨텍스트 수집.** PR 메타데이터 fetch, base/head SHA 로컬 존재 확인, 누락 시 강제 fetch. 출력: 결정적 워크스페이스 스냅샷.",
				},
				{
					kind: "p",
					text: "**Phase 2 — 델타 추출.** base와 head 사이 `git diff-tree`로 정규화된 변경 델타 구축. 각 델타는 파일별 blob SHA, mode 변경, 리네임 추적을 포함. 출력: `DeltaEntry` 배열.",
				},
				{
					kind: "p",
					text: "**Phase 3 — 심볼 플로우 & Import 분석.** 각 변경 파일의 AST 파싱(meriyah), export/import 추출, specifier resolve, 파일→파일 및 그룹→그룹 의존 edge 구축. 출력: `FileSymbols` 맵과 `ImportDepResult`.",
				},
				{
					kind: "p",
					text: "**Phase 4 — 파티션.** 모호한(다중 그룹) 파일과 미배치 파일 탐지. LLM으로 배치 해결. 신뢰도 스코어링으로 검증. 점수가 오분류를 나타내면 재배치 적용. 출력: 경고와 함께 ownership 맵.",
				},
				{
					kind: "p",
					text: "**Phase 5 — 결합·분할·재균형.** 원자적 coupling 규칙 적용(lockfile + package.json은 반드시 함께). 8개 파일 초과 그룹을 LLM 가이드 분해로 분할. 중앙값의 3배 초과 그룹 재균형. 파일 0개 그룹 병합. git 히스토리의 co-change 시그널 반영. 출력: 정제된 그룹 세트.",
				},
				{
					kind: "p",
					text: "**Phase 6 — 실행 가능성 & 순환 해소.** 제약 그래프 구축(path-order + dependency edge). 탐욕적 edge 제거로 순환 탐지·해소. 커밋 날짜 타이브레이킹으로 위상 정렬. 출력: 그룹 순서와 DAG edge 세트, 또는 진단적 실패.",
				},
				{
					kind: "p",
					text: "**Phase 7 — DAG 플랜.** DAG 부모, ancestor set, 그룹별 git index, expected tree SHA 계산. 출력: 결정적 트리 예측이 포함된 `StackPlan`.",
				},
				{
					kind: "p",
					text: "**Phase 8 — 실행.** 브랜치와 multi-parent 커밋 생성. ancestor set을 존중하며 파일 델타를 그룹별 index에 적용. 트리 오브젝트 기록, `git commit-tree`로 커밋 생성. Multi-leaf DAG는 all-changes index 유지. 출력: 커밋 SHA와 브랜치명이 포함된 `StackExecResult`.",
				},
				{
					kind: "p",
					text: "**Phase 9 — 검증.** 범위, 완전성, 트리 동일성 체크 실행. 트리 동일성이 실패하면 전체 실행이 롤백(브랜치 삭제, ref 정리). 출력: 검증된 결과 또는 하드 실패.",
				},
			],
		},
	],
	references: [
		{
			id: "1",
			text: "Sadowski, C., Söderberg, E., Church, L., Sipko, M., & Bacchelli, A. (2018). Modern Code Review: A Case Study at Google. ICSE '18.",
			url: "https://doi.org/10.1145/3183519.3183525",
		},
		{
			id: "2",
			text: "di Biase, M., Bruntink, M., & van Deursen, A. (2020). The effects of change decomposition on code review — a controlled experiment. PeerJ Computer Science, 6, e289.",
			url: "https://doi.org/10.7717/peerj-cs.289",
		},
		{
			id: "3",
			text: "Kudrjavets, G., Nagappan, N., & Ball, T. (2022). Do Small Code Changes Merge Faster? A Multi-Language Empirical Investigation. arXiv:2211.05668.",
			url: "https://arxiv.org/abs/2211.05668",
		},
		{
			id: "4",
			text: "Shen, B., Zhang, W., Zhao, H., Liang, G., Jin, Z., & Wang, Q. (2021). SmartCommit: A Graph-Based Interactive Assistant for Activity-Oriented Commits. ESEC/FSE '21.",
			url: "https://doi.org/10.1145/3468264.3468551",
		},
		{
			id: "5",
			text: "Laval, J. & Ducasse, S. Resolving Cyclic Dependencies between Packages with Enriched Dependency Structural Matrix. Software: Practice and Experience.",
			url: "https://doi.org/10.1002/spe.2220",
		},
		{
			id: "6",
			text: "Propel. Code Review Analytics: PR Size and Defect Correlation (내부 연구, 50K+ PR 분석).",
		},
		{
			id: "7",
			text: "Haratian, A., Tajalli, S., & Izadi, M. (2024). RefExpo: Unveiling Software Project Structures through Advanced Dependency Graph Extraction. arXiv:2501.00958.",
			url: "https://arxiv.org/abs/2501.00958",
		},
	],
};

// ============================================================================
// Rendering Components
// ============================================================================

const RICH_TEXT_RE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[\d+\])/g;

function RichText({ text }: { text: string }) {
	const parts = text.split(RICH_TEXT_RE);
	return (
		<>
			{parts.map((part, i) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					return (
						<code key={i} className="px-1.5 py-0.5 bg-zinc-800/80 rounded text-[13px] font-mono text-emerald-300/90">
							{part.slice(1, -1)}
						</code>
					);
				}
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<strong key={i} className="font-semibold text-zinc-100">
							{part.slice(2, -2)}
						</strong>
					);
				}
				const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
				if (linkMatch) {
					return (
						<a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/30">
							{linkMatch[1]}
						</a>
					);
				}
				const refMatch = part.match(/^\[(\d+)\]$/);
				if (refMatch) {
					return (
						<a key={i} href="#references" className="text-blue-400/70 hover:text-blue-300 text-[12px] align-super no-underline">
							[{refMatch[1]}]
						</a>
					);
				}
				return <span key={i}>{part}</span>;
			})}
		</>
	);
}

function CodeBlock({ code, caption }: { code: string; caption?: string }) {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getHighlighter().then((h) => {
			if (cancelled) return;
			const result = h.codeToHtml(code, { lang: "typescript", theme: "github-dark" });
			setHtml(result);
		});
		return () => { cancelled = true; };
	}, [code]);

	return (
		<div className="rounded-lg sm:rounded-xl border border-zinc-800 bg-[#0d1117] p-3 sm:p-5 my-3 sm:my-4 -mx-4 sm:mx-0">
			{caption && (
				<div className="flex items-center gap-2 mb-2.5 sm:mb-3 pb-2 sm:pb-2.5 border-b border-zinc-800/60">
					<div className="hidden sm:flex gap-1.5">
						<span className="w-2.5 h-2.5 rounded-full bg-zinc-700/60" />
						<span className="w-2.5 h-2.5 rounded-full bg-zinc-700/60" />
						<span className="w-2.5 h-2.5 rounded-full bg-zinc-700/60" />
					</div>
					<p className="text-[10px] sm:text-[11px] text-zinc-500 font-mono truncate">{caption}</p>
				</div>
			)}
			{html ? (
				<div
					className="shiki-wrapper text-[11px] sm:text-[13px] font-mono leading-5 sm:leading-6 overflow-x-auto [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!text-[inherit] [&_code]:!leading-[inherit]"
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<pre className="text-[11px] sm:text-[13px] text-zinc-300 font-mono leading-5 sm:leading-6 whitespace-pre overflow-x-auto">{code}</pre>
			)}
		</div>
	);
}

function NoteBlock({ title, text }: { title?: string; text: string }) {
	return (
		<div className="rounded-lg sm:rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 sm:p-5 my-3 sm:my-4">
			{title && (
				<p className="text-[12px] sm:text-[13px] font-semibold text-blue-300 mb-2">{title}</p>
			)}
			<p className="text-[12px] sm:text-[13px] text-zinc-300/85 leading-6 sm:leading-7">
				<RichText text={text} />
			</p>
		</div>
	);
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
	switch (block.kind) {
		case "p":
			return (
				<p className="text-[14px] sm:text-[15px] text-zinc-300/90 leading-7 sm:leading-8">
					<RichText text={block.text} />
				</p>
			);
		case "code":
			return <CodeBlock code={block.code} caption={block.caption} />;
		case "note":
			return <NoteBlock title={block.title} text={block.text} />;
	}
}

function SectionHeader({ id, title }: { id: string; title: string }) {
	return (
		<h2 id={id} className="scroll-mt-24 sm:scroll-mt-28 text-[22px] sm:text-[26px] md:text-[30px] font-bold tracking-tight mb-4 sm:mb-5">
			{title}
		</h2>
	);
}

// ============================================================================
// Main Page Component
// ============================================================================

export function StackingArticlePage({ locale }: { locale: Locale }) {
	const c = locale === "ko" ? KO_CONTENT : EN_CONTENT;
	const homePath = locale === "ko" ? "/newpr/ko/" : "/newpr/";
	const [tocOpen, setTocOpen] = useState(false);

	return (
		<>
			<div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 sm:gap-3 bg-[#0d1b33]/90 backdrop-blur-sm py-1.5 border-b border-blue-500/10">
				<a href="https://www.sionic.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 sm:gap-2.5 opacity-75 hover:opacity-100 transition-opacity">
					<span className="text-[10px] sm:text-[11px] text-zinc-400 uppercase tracking-widest">Sponsored by</span>
					<img src="https://www.sionic.ai/favicon.ico" alt="Sionic AI" className="h-4 w-4" />
					<span className="text-[12px] sm:text-[13px] text-zinc-200 font-medium">Sionic AI</span>
				</a>
			</div>
			<nav className="fixed top-8 left-0 right-0 z-50 bg-[#09090b]/85 backdrop-blur-xl border-b border-zinc-800/60">
				<div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-12 sm:h-14 flex items-center justify-between">
					<a href={homePath} className="font-mono text-sm font-semibold tracking-tight">newpr</a>
					<div className="flex items-center gap-3 sm:gap-5">
						<a href={homePath} className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{c.homeLabel}</a>
						<a href={c.langSwitchPath} className="text-[12px] sm:text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{c.langSwitchLabel}</a>
						<a href={c.ctaPath} target="_blank" rel="noopener" className="h-7 sm:h-8 px-2.5 sm:px-3.5 bg-white text-black text-[12px] sm:text-[13px] font-medium rounded-lg flex items-center hover:bg-zinc-200 transition-colors">
							{c.ctaLabel}
						</a>
					</div>
				</div>
			</nav>

			<main className="pt-36 sm:pt-44 pb-16 sm:pb-24 px-4 sm:px-6">
				<div className="max-w-[1100px] mx-auto">
					<div className="mb-8 sm:mb-10">
						<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[11px] sm:text-[12px] text-blue-400 font-medium mb-4 sm:mb-5">
							<Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
							{c.badge}
						</div>
						<h1 className="text-[28px] sm:text-5xl lg:text-[56px] font-bold tracking-[-0.035em] leading-[1.08] mb-4 sm:mb-5">
							{c.title}
						</h1>
						<p className="text-[15px] sm:text-lg text-zinc-400 max-w-[760px] leading-relaxed mb-4 sm:mb-5">
							{c.subtitle}
						</p>
						<div className="flex items-center gap-3 text-[11px] sm:text-[12px] text-zinc-500">
							<span>{c.updated}</span>
							<span className="text-zinc-700">•</span>
							<span>{c.readingTime}</span>
						</div>
					</div>

					<div className="grid lg:grid-cols-[220px_1fr] gap-6 lg:gap-10">
						<aside className="hidden lg:block lg:sticky lg:top-28 self-start">
							<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
								<p className="text-[11px] uppercase tracking-widest text-zinc-500">Contents</p>
								{c.articleSections.map((section) => (
									<a
										key={section.id}
										href={`#${section.id}`}
										className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
									>
										{section.title}
									</a>
								))}
								<a href="#references" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">
									{c.referencesTitle}
								</a>
							</div>
						</aside>

						{tocOpen && (
							<div className="lg:hidden fixed inset-0 z-[60]" onClick={() => setTocOpen(false)}>
								<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
								<div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-zinc-700 bg-[#09090b] p-5 pb-8 space-y-2 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
									<div className="flex items-center justify-between mb-3">
										<p className="text-[11px] uppercase tracking-widest text-zinc-500">Contents</p>
										<button type="button" onClick={() => setTocOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-sm">✕</button>
									</div>
									{c.articleSections.map((section) => (
										<a
											key={section.id}
											href={`#${section.id}`}
											onClick={() => setTocOpen(false)}
											className="block text-[14px] text-zinc-400 hover:text-zinc-100 transition-colors py-1"
										>
											{section.title}
										</a>
									))}
									<a href="#references" onClick={() => setTocOpen(false)} className="block text-[14px] text-zinc-400 hover:text-zinc-100 transition-colors py-1">
										{c.referencesTitle}
									</a>
								</div>
							</div>
						)}

						<button
							type="button"
							onClick={() => setTocOpen(true)}
							className="lg:hidden fixed bottom-5 right-5 z-50 h-11 w-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-lg shadow-black/40 hover:bg-zinc-700 transition-colors"
							aria-label="Table of contents"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>
						</button>

						{/* Article */}
						<article className="space-y-10 sm:space-y-14">
							{c.articleSections.map((section) => (
								<section key={section.id}>
									<SectionHeader id={section.id} title={section.title} />
									<div className="space-y-4">
										{section.blocks.map((block, i) => (
											<ContentBlockRenderer key={i} block={block} />
										))}
									</div>
								</section>
							))}

							{/* References */}
							<section>
								<SectionHeader id="references" title={c.referencesTitle} />
								<div className="space-y-2.5 sm:space-y-3">
									{c.references.map((ref) => (
										<div key={ref.id} className="flex gap-2 sm:gap-3 text-[12px] sm:text-[13px] text-zinc-400 leading-5 sm:leading-6">
											<span className="text-zinc-500 font-mono shrink-0">[{ref.id}]</span>
											<span>
												{ref.text}
												{ref.url && (
													<>
														{" "}
														<a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-400/70 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/20 break-all">
															{ref.url}
														</a>
													</>
												)}
											</span>
										</div>
									))}
								</div>
							</section>

							{/* Closing */}
							<section className="rounded-xl sm:rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 sm:p-7">
								<h3 className="text-[20px] sm:text-[26px] font-bold tracking-tight mb-3">{c.closingTitle}</h3>
								<p className="text-[14px] sm:text-[15px] text-zinc-300/90 leading-7 sm:leading-8 mb-4 sm:mb-5">{c.closingParagraph}</p>
								<div className="flex flex-wrap items-center gap-3">
									<a href={homePath} className="h-10 px-4 rounded-lg border border-zinc-700 text-zinc-300 text-[13px] font-medium inline-flex items-center gap-2 hover:border-zinc-500 hover:text-zinc-100 transition-colors">
										<ArrowLeft className="w-4 h-4" />
										{c.homeLabel}
									</a>
									<a href={c.ctaPath} target="_blank" rel="noopener" className="h-10 px-4 rounded-lg bg-white text-black text-[13px] font-semibold inline-flex items-center gap-2 hover:bg-zinc-200 transition-colors">
										{c.ctaLabel}
										<ArrowRight className="w-4 h-4" />
									</a>
								</div>
							</section>
						</article>
					</div>
				</div>
			</main>
		</>
	);
}
