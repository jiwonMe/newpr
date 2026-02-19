import React from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, GitBranch, Layers, ShieldCheck, Sparkles, Workflow } from "lucide-react";

type Locale = "en" | "ko";

interface PrincipleItem {
	title: string;
	description: string;
}

interface PipelineItem {
	phase: string;
	goal: string;
	how: string;
	output: string;
}

interface RiskItem {
	risk: string;
	mitigation: string;
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
	sections: {
		problem: string;
		principles: string;
		pipeline: string;
		safety: string;
		operations: string;
		guide: string;
	};
	problemParagraphs: string[];
	principles: PrincipleItem[];
	pipeline: PipelineItem[];
	safetyItems: string[];
	risks: RiskItem[];
	operatorGuide: string[];
	closingTitle: string;
	closingParagraph: string;
}

const EN_CONTENT: ArticleContent = {
	htmlLang: "en",
	pageTitle: "How PR Stacking Works",
	badge: "Engineering Deep Dive",
	title: "How PR Stacking Works: DAG-Structured Splitting for Large Pull Requests",
	subtitle:
		"A practical breakdown of how newpr converts one massive pull request into a DAG (Directed Acyclic Graph) of smaller draft PRs — using symbol-flow analysis, confidence scoring, and co-change signals — without changing the final tree.",
	updated: "Updated for v1.0.23",
	readingTime: "~10 min read",
	homeLabel: "Back to landing",
	langSwitchLabel: "한국어",
	langSwitchPath: "/newpr/ko/stacking-principles.html",
	ctaLabel: "Try newpr",
	ctaPath: "https://github.com/jiwonMe/newpr",
	sections: {
		problem: "Why Stacking Exists",
		principles: "Core Design Principles",
		pipeline: "Pipeline: From One PR to Many",
		safety: "Safety Guarantees",
		operations: "Operational Failure Modes",
		guide: "Review Workflow Tips",
	},
	problemParagraphs: [
		"Large pull requests fail for a predictable reason: review bandwidth does not scale with diff size. Past a few hundred lines, reviewers switch from understanding intent to scanning for obvious mistakes. Important architecture changes get buried.",
		"Google's engineering practices explicitly state that 'small, simple CLs are reviewed more quickly, more thoroughly, and are less likely to introduce bugs' ([Google Engineering Practices](https://google.github.io/eng-practices/review/developer/small-cls.html)). Yet, as codebase complexity grows, so does the natural size of feature branches.",
		"PR stacking solves this by preserving one logical feature while splitting delivery into smaller review units. Instead of asking reviewers to validate 40 files at once, it presents a dependency-ordered DAG where each PR has a narrower concern and clearer boundary. Research shows that keeping PRs under 200 lines results in optimal review quality ([Graphite](https://graphite.com/guides/break-up-large-pull-requests)).",
		"Earlier versions of the stacking algorithm produced a simple linear chain. Real-world PRs, however, often have independent concerns — a schema change and a UI refactor that don't depend on each other. Forcing these into a single sequence creates unnecessary review bottlenecks. The current algorithm builds a DAG (Directed Acyclic Graph) instead, allowing independent groups to be reviewed and merged in parallel while preserving correct ordering for actual dependencies.",
		"The hard part is correctness. If splitting changes behavior, stacking becomes dangerous. So the algorithm is built around invariants that guarantee the final result is equivalent to the original pull request.",
	],
	principles: [
		{
			title: "Tree Equivalence Over Convenience",
			description:
				"The top-level invariant is strict: the final stacked tree must match the original PR head tree exactly. Any deviation is a hard failure, not a warning.",
		},
		{
			title: "DAG Over Linear Chain",
			description:
				"Groups form a DAG, not a flat sequence. Each group declares explicit dependency edges. Independent groups can be reviewed and merged in parallel, while dependent groups maintain correct ordering.",
		},
		{
			title: "Multi-Signal Dependency Analysis",
			description:
				"Ordering is derived from four signals: AST-level symbol flow (import/export), directory proximity, co-change frequency in git history, and commit-order path constraints. A confidence score merges these signals to make robust grouping decisions.",
		},
		{
			title: "Soft Cycle Breaking",
			description:
				"Dependency cycles are treated as soft hints, not hard failures. The algorithm automatically breaks cycles by removing the weakest edges (path-order first, then dependency) to produce a valid topological order.",
		},
	],
	pipeline: [
		{
			phase: "1) Context Capture",
			goal: "Load base/head SHA and repository context for the source PR.",
			how: "Fetch PR metadata, ensure required SHAs are available locally, and hydrate analysis artifacts.",
			output: "A deterministic workspace snapshot with base/head boundaries.",
		},
		{
			phase: "2) Delta Extraction",
			goal: "Extract structural change deltas between base and head.",
			how: "Build a normalized change graph from file-level and hunk-level differences using git plumbing.",
			output: "Machine-usable delta objects with per-file blob SHAs and mode changes.",
		},
		{
			phase: "3) Symbol Flow & Import Analysis",
			goal: "Map cross-file dependencies at the symbol level.",
			how: "Parse each changed file's AST (via meriyah) to extract exports/imports. Resolve relative specifiers to actual file paths. Build both file→file and group→group dependency edges from import relationships.",
			output: "A symbol index (which file exports which symbols) and a group-level dependency map.",
		},
		{
			phase: "4) Initial Partitioning",
			goal: "Assign changed files into candidate concern groups.",
			how: "Combine existing analysis groups with AI classification for unassigned or ambiguous files. Use confidence scoring (import affinity 40%, directory proximity 30%, symbol overlap 20%, co-change frequency 10%, plus layer bonus) to validate and refine assignments.",
			output: "Initial ownership map plus reattribution warnings and confidence scores.",
		},
		{
			phase: "5) Coupling, Rebalance & Co-Change",
			goal: "Reduce unsafe cross-group dependencies using multi-signal analysis.",
			how: "Apply coupling rules, split oversized groups, rebalance edges, and merge empty groups. Incorporate co-change analysis from git history to identify files that frequently change together.",
			output: "A cleaner grouping set with fewer hidden cross-cutting edges.",
		},
		{
			phase: "6) Feasibility & Cycle Resolution",
			goal: "Prove the grouping can form a valid DAG stack.",
			how: "Build constraint edges (path-order and dependency). Detect cycles and automatically break them by removing the weakest edges. Topologically sort the resulting acyclic graph with tie-breaking by earliest commit date.",
			output: "Topological order, explicit dependency edges for the DAG, or diagnostics if truly infeasible.",
		},
		{
			phase: "7) DAG Plan Generation",
			goal: "Create a concrete DAG stack plan with expected trees and ancestor sets.",
			how: "Build per-group commit plan with explicit DAG parent edges. Compute ancestor sets (transitive closure) for each group. Predict expected tree hashes using git index operations.",
			output: "Executable plan with DAG structure, ancestor sets, and deterministic tree expectations.",
		},
		{
			phase: "8) DAG Stack Execution",
			goal: "Materialize the DAG branch/commit structure.",
			how: "For each group in topological order, apply its file deltas onto the base tree (including all ancestor groups' changes). Create commits with multiple parents (one per DAG dependency) using git commit-tree. For DAGs with multiple leaf nodes, verify an all-changes index separately.",
			output: "A DAG branch hierarchy with multi-parent commits, ready for draft PR publishing.",
		},
		{
			phase: "9) Verification",
			goal: "Verify output is semantically identical to original PR.",
			how: "Compare resulting tree state (union of all leaf groups or the all-changes index) against original head tree and run invariant checks.",
			output: "Verified stack or hard failure with error context.",
		},
	],
	safetyItems: [
		"Invariant: tree(stackTop) == tree(originalHEAD) — enforced via all-changes index for multi-leaf DAGs",
		"DAG ancestor sets guarantee each group sees all prerequisite changes",
		"Cycles are auto-resolved by removing weakest constraint edges, preserving topological validity",
		"Intermediate PRs remain reviewable with correct dependency-based base branches",
		"Warnings are structured and surfaced (assignment, grouping, coupling, verification)",
	],
	risks: [
		{
			risk: "Over-coupled change set",
			mitigation: "Multi-signal coupling analysis (symbol flow + co-change + path-order) plus split/rebalance and feasibility gate prevent unsafe decomposition.",
		},
		{
			risk: "AI misclassification of file ownership",
			mitigation: "Confidence scoring validates AI assignments against four independent signals. Low-confidence assignments are flagged and reassigned.",
		},
		{
			risk: "Circular dependencies between groups",
			mitigation: "Soft cycle breaking automatically removes weakest edges (path-order before dependency). All cycles are resolved without failing the pipeline.",
		},
		{
			risk: "DAG tree mismatch (multi-leaf divergence)",
			mitigation: "A dedicated all-changes index tracks the union of all groups. Final verification compares this against the original HEAD tree, catching any divergence.",
		},
		{
			risk: "Repository state drift (missing SHAs)",
			mitigation: "Required SHA verification forces fetch when base/head objects are missing.",
		},
	],
	operatorGuide: [
		"Use stacking when one PR has multiple concerns (schema + API + UI + tests) but still belongs to one feature thread.",
		"The DAG structure means independent groups (e.g., schema changes and unrelated UI tweaks) appear at the same level and can be reviewed in parallel.",
		"Each generated PR uses level-based labels (L0, L1, L2) indicating its depth in the DAG, plus dependency links showing which PRs must merge first.",
		"If cycle resolution drops an edge you consider important, manually adjust the coupling before rerunning.",
		"Use stacked draft PRs to parallelize review feedback while preserving merge order dictated by the DAG.",
	],
	closingTitle: "Why this matters",
	closingParagraph:
		"PR stacking is not just a UI convenience. It is a correctness-constrained DAG transformation from one large review unit into many smaller ones. Done right, it unlocks parallel review for independent concerns, improves reviewer throughput, reduces cognitive load, and keeps delivery semantics intact.",
};

const KO_CONTENT: ArticleContent = {
	htmlLang: "ko",
	pageTitle: "PR Stacking 원리",
	badge: "엔지니어링 딥다이브",
	title: "PR Stacking은 어떻게 동작할까: DAG 구조로 대형 PR을 안전하게 분해하는 원리",
	subtitle:
		"newpr가 하나의 거대한 PR을 심볼 플로우 분석, 신뢰도 스코어링, co-change 시그널을 활용해 최종 결과를 바꾸지 않고 DAG(방향 비순환 그래프) 구조의 Draft PR로 분해하는 과정을 설명합니다.",
	updated: "v1.0.23 기준",
	readingTime: "약 10분",
	homeLabel: "소개 페이지로 돌아가기",
	langSwitchLabel: "EN",
	langSwitchPath: "/newpr/stacking-principles.html",
	ctaLabel: "newpr 사용해보기",
	ctaPath: "https://github.com/jiwonMe/newpr",
	sections: {
		problem: "왜 Stacking이 필요한가",
		principles: "핵심 설계 원칙",
		pipeline: "파이프라인: 하나의 PR을 여러 개로",
		safety: "안전성 보장",
		operations: "운영 시 실패 패턴과 대응",
		guide: "실전 리뷰 운영 팁",
	},
	problemParagraphs: [
		"대형 PR이 어려운 이유는 단순합니다. 변경량이 커질수록 리뷰어의 이해 비용이 선형이 아니라 급격히 증가합니다. 결국 설계 의도 검증 대신 표면적인 오류 탐지에 머무르게 됩니다.",
		"구글의 엔지니어링 가이드라인에서도 '작고 단순한 변경(CL)이 더 빨리, 더 철저하게 리뷰되며 버그 가능성이 낮다'고 명시합니다 ([Google Engineering Practices](https://google.github.io/eng-practices/review/developer/small-cls.html)). 하지만 기능의 복잡도가 증가함에 따라 PR의 크기도 자연스럽게 커지기 마련입니다.",
		"PR stacking은 하나의 기능 흐름은 유지하면서 리뷰 단위를 작게 나눕니다. 리뷰어는 40개 파일을 한 번에 보는 대신, 의존성이 정리된 DAG 순서대로 작은 PR을 검토할 수 있습니다. 연구에 따르면 200줄 미만의 PR이 가장 높은 리뷰 품질을 유지한다고 합니다 ([Graphite](https://graphite.com/guides/break-up-large-pull-requests)).",
		"이전 버전의 스택 알고리즘은 단순한 선형 체인을 생성했습니다. 하지만 실제 PR에는 서로 독립적인 관심사 — 예를 들어 스키마 변경과 무관한 UI 리팩토링 — 가 함께 존재합니다. 이를 하나의 순서로 강제하면 불필요한 리뷰 병목이 생깁니다. 현재 알고리즘은 DAG(방향 비순환 그래프)를 만들어, 독립 그룹은 병렬로 리뷰·머지하고 실제 의존이 있는 그룹만 순서를 유지합니다.",
		"중요한 건 정확성입니다. 분할 과정에서 동작이 달라지면 stacking은 오히려 위험해집니다. 그래서 newpr의 스택 파이프라인은 결과 동일성 보장을 최우선 불변조건으로 둡니다.",
	],
	principles: [
		{
			title: "편의보다 트리 동일성",
			description:
				"최종 불변식은 명확합니다. stack의 마지막 트리는 원본 PR의 head 트리와 완전히 동일해야 합니다. 어긋나면 성공이 아니라 실패입니다.",
		},
		{
			title: "선형 체인이 아닌 DAG",
			description:
				"그룹은 일렬이 아닌 DAG를 형성합니다. 각 그룹은 명시적 의존 edge를 선언하며, 독립 그룹은 병렬로 리뷰·머지가 가능하고 의존 그룹만 정확한 순서를 유지합니다.",
		},
		{
			title: "다중 시그널 의존성 분석",
			description:
				"순서 결정에 네 가지 시그널을 사용합니다: AST 기반 심볼 플로우(import/export), 디렉토리 근접도, git 히스토리의 co-change 빈도, 커밋 순서 경로 제약. 신뢰도 스코어가 이 시그널들을 종합하여 견고한 그룹핑을 수행합니다.",
		},
		{
			title: "순환 의존의 소프트 해소",
			description:
				"의존성 순환은 하드 실패가 아닌 소프트 힌트로 처리합니다. 알고리즘이 가장 약한 edge(path-order 우선, 다음 dependency)를 자동으로 제거해 유효한 위상 정렬을 만듭니다.",
		},
	],
	pipeline: [
		{
			phase: "1) 컨텍스트 수집",
			goal: "소스 PR의 base/head SHA와 저장소 상태를 확정합니다.",
			how: "PR 메타데이터를 가져오고, 필요한 SHA 오브젝트 존재 여부를 확인한 뒤 누락 시 강제 fetch 합니다.",
			output: "재현 가능한 분석 경계(base/head) 확보",
		},
		{
			phase: "2) 델타 추출",
			goal: "base 대비 head의 구조적 변경 정보를 만듭니다.",
			how: "git plumbing으로 파일/변경 단위의 정규화된 delta를 생성합니다.",
			output: "파일별 blob SHA와 mode 변경을 포함한 delta 객체",
		},
		{
			phase: "3) 심볼 플로우 & import 분석",
			goal: "심볼 수준에서 파일 간 의존성을 매핑합니다.",
			how: "변경된 파일의 AST를 파싱(meriyah)하여 export/import를 추출하고, 상대 경로 specifier를 실제 파일로 resolve합니다. 파일→파일 및 그룹→그룹 의존 edge를 import 관계로부터 생성합니다.",
			output: "심볼 인덱스(어떤 파일이 어떤 심볼을 export하는지)와 그룹 레벨 의존성 맵",
		},
		{
			phase: "4) 1차 그룹 분할",
			goal: "변경 파일을 관심사 단위 그룹에 배치합니다.",
			how: "기존 분석 그룹 + AI 분류를 조합해 미할당/모호 파일을 재배치합니다. 신뢰도 스코어링(import 친화도 40%, 디렉토리 근접도 30%, 심볼 겹침 20%, co-change 빈도 10%, 레이어 보너스)으로 배치를 검증·보정합니다.",
			output: "초기 ownership 맵 + 재배치 경고 + 신뢰도 점수",
		},
		{
			phase: "5) 결합 완화와 Co-Change 분석",
			goal: "다중 시그널로 그룹 간 위험한 교차 의존을 줄입니다.",
			how: "coupling 규칙 적용, oversized 그룹 분리, 재균형, empty 그룹 병합. git 히스토리의 co-change 분석으로 자주 함께 변경되는 파일 패턴을 반영합니다.",
			output: "실행 가능한 품질의 그룹 세트",
		},
		{
			phase: "6) 실행 가능성 & 순환 해소",
			goal: "이 그룹 구조가 유효한 DAG 스택이 될 수 있는지 증명합니다.",
			how: "path-order와 dependency constraint edge를 구축합니다. 순환을 탐지하면 가장 약한 edge를 자동 제거합니다. 결과 비순환 그래프를 최초 커밋 시각 기준 tie-breaking으로 위상 정렬합니다.",
			output: "위상 정렬 순서 + DAG 의존 edge, 또는 진정 불가능 시 진단 정보",
		},
		{
			phase: "7) DAG 계획 생성",
			goal: "예상 트리와 ancestor set을 포함한 DAG 스택 계획을 만듭니다.",
			how: "명시적 DAG 부모 edge가 포함된 그룹별 커밋 계획을 작성합니다. 각 그룹의 ancestor set(전이적 폐포)을 계산하고, git index 연산으로 expected tree hash를 예측합니다.",
			output: "DAG 구조, ancestor set, 결정적 트리 기대치를 갖춘 실행 플랜",
		},
		{
			phase: "8) DAG 스택 실행",
			goal: "DAG 브랜치/커밋 구조를 실제로 생성합니다.",
			how: "위상 순서대로 각 그룹의 파일 델타를 base 트리에 적용(모든 ancestor 그룹 변경 포함). git commit-tree로 DAG 의존당 하나의 parent를 갖는 multi-parent 커밋을 생성합니다. leaf 노드가 여러 개인 DAG는 all-changes index를 별도 검증합니다.",
			output: "multi-parent 커밋이 포함된 DAG 브랜치 계층, Draft PR 발행 준비 완료",
		},
		{
			phase: "9) 결과 검증",
			goal: "원본 PR과 결과가 동일함을 확인합니다.",
			how: "결과 트리(모든 leaf 그룹의 합집합 또는 all-changes index)를 원본 head 트리와 비교하고 불변식을 검증합니다.",
			output: "검증 성공 또는 즉시 실패",
		},
	],
	safetyItems: [
		"불변식: tree(stackTop) == tree(originalHEAD) — multi-leaf DAG는 all-changes index로 보장",
		"DAG ancestor set이 각 그룹에 모든 선행 변경이 포함됨을 보증",
		"순환은 가장 약한 constraint edge를 제거해 자동 해소, 위상 정렬 유효성 유지",
		"중간 PR도 의존성 기반 base branch로 올바른 리뷰 가능 상태 유지",
		"assignment/grouping/coupling/verification 경고를 구조화해서 표출",
	],
	risks: [
		{
			risk: "변경이 과도하게 결합된 경우",
			mitigation: "다중 시그널 coupling 분석(심볼 플로우 + co-change + path-order)과 split/rebalance + feasibility gate로 분해 불가능 케이스를 사전 차단합니다.",
		},
		{
			risk: "AI 파일 분류 오차",
			mitigation: "신뢰도 스코어링이 네 가지 독립 시그널로 AI 배치를 검증합니다. 신뢰도가 낮은 배치는 플래그를 남기고 재배치합니다.",
		},
		{
			risk: "그룹 간 순환 의존",
			mitigation: "소프트 순환 해소가 가장 약한 edge(path-order 우선)를 자동 제거합니다. 모든 순환은 파이프라인 실패 없이 해소됩니다.",
		},
		{
			risk: "DAG 트리 불일치 (multi-leaf 분기)",
			mitigation: "전용 all-changes index가 전체 그룹의 합집합을 추적합니다. 최종 검증에서 원본 HEAD 트리와 비교해 모든 분기를 잡습니다.",
		},
		{
			risk: "base/head SHA 누락",
			mitigation: "required SHA 검증 후 누락 시 강제 fetch하여 잘못된 기준점 실행을 방지합니다.",
		},
	],
	operatorGuide: [
		"하나의 PR 안에 스키마/API/UI/테스트처럼 서로 다른 관심사가 섞여 있을 때 stacking 효과가 가장 큽니다.",
		"DAG 구조 덕분에 독립적인 그룹(예: 스키마 변경과 무관한 UI 수정)은 같은 레벨에 위치하며 병렬로 리뷰할 수 있습니다.",
		"생성된 각 PR은 레벨 기반 라벨(L0, L1, L2)로 DAG 깊이를 표시하며, 어떤 PR이 먼저 머지되어야 하는지 의존성 링크가 포함됩니다.",
		"순환 해소가 중요한 edge를 제거한 경우, coupling을 수동 조정한 뒤 재실행하세요.",
		"Draft PR DAG를 활용하면 독립 관심사의 병렬 피드백과 의존 순서에 따른 순차 머지를 동시에 가져갈 수 있습니다.",
	],
	closingTitle: "핵심 요약",
	closingParagraph:
		"PR stacking은 UI 편의 기능이 아니라, 정합성을 강하게 보장하는 DAG 변환 파이프라인입니다. 올바르게 동작하면 독립 관심사의 병렬 리뷰를 가능하게 하고, 리뷰 처리량을 높이고 인지 부하를 줄이면서도 최종 결과의 의미를 그대로 유지합니다.",
};

const CODE_SNIPPET = `extractDeltas -> extractSymbols -> analyzeImportDeps
    -> partitionGroups (+ confidenceScoring)
    -> applyCouplingRules -> buildCoChangePairs
    -> splitOversizedGroups -> rebalanceGroups
    -> checkFeasibility (+ softCycleBreaking)
    -> createStackPlan (DAG parents + ancestor sets)
    -> executeStack (multi-parent commits)
    -> verifyStack`;

function SectionHeader({ id, title }: { id: string; title: string }) {
	return (
		<h2 id={id} className="scroll-mt-28 text-[26px] sm:text-[30px] font-bold tracking-tight mb-5">
			{title}
		</h2>
	);
}

export function StackingArticlePage({ locale }: { locale: Locale }) {
	const c = locale === "ko" ? KO_CONTENT : EN_CONTENT;
	const homePath = locale === "ko" ? "/newpr/ko/" : "/newpr/";

	return (
		<>
			<div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-[#0d1b33]/90 backdrop-blur-sm py-1.5 border-b border-blue-500/10">
				<a href="https://www.sionic.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity">
					<span className="text-[11px] text-zinc-400 uppercase tracking-widest">Sponsored by</span>
					<img src="https://www.sionic.ai/favicon.ico" alt="Sionic AI" className="h-4 w-4" />
					<span className="text-[13px] text-zinc-200 font-medium">Sionic AI</span>
				</a>
			</div>
			<nav className="fixed top-8 left-0 right-0 z-50 bg-[#09090b]/85 backdrop-blur-xl border-b border-zinc-800/60">
				<div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
					<a href={homePath} className="font-mono text-sm font-semibold tracking-tight">newpr</a>
					<div className="flex items-center gap-5">
						<a href={homePath} className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{c.homeLabel}</a>
						<a href={c.langSwitchPath} className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{c.langSwitchLabel}</a>
						<a href={c.ctaPath} target="_blank" rel="noopener" className="h-8 px-3.5 bg-white text-black text-[13px] font-medium rounded-lg flex items-center hover:bg-zinc-200 transition-colors">
							{c.ctaLabel}
						</a>
					</div>
				</div>
			</nav>

			<main className="pt-40 sm:pt-44 pb-24 px-6">
				<div className="max-w-[1100px] mx-auto">
					<div className="mb-10">
						<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[12px] text-blue-400 font-medium mb-5">
							<Sparkles className="w-3.5 h-3.5" />
							{c.badge}
						</div>
						<h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold tracking-[-0.035em] leading-[1.08] mb-5">
							{c.title}
						</h1>
						<p className="text-base sm:text-lg text-zinc-400 max-w-[760px] leading-relaxed mb-5">
							{c.subtitle}
						</p>
						<div className="flex items-center gap-3 text-[12px] text-zinc-500">
							<span>{c.updated}</span>
							<span className="text-zinc-700">•</span>
							<span>{c.readingTime}</span>
						</div>
					</div>

					<div className="grid lg:grid-cols-[220px_1fr] gap-10">
						<aside className="lg:sticky lg:top-28 self-start">
							<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
								<p className="text-[11px] uppercase tracking-widest text-zinc-500">Contents</p>
								<a href="#problem" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.problem}</a>
								<a href="#principles" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.principles}</a>
								<a href="#pipeline" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.pipeline}</a>
								<a href="#safety" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.safety}</a>
								<a href="#operations" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.operations}</a>
								<a href="#guide" className="block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{c.sections.guide}</a>
							</div>
						</aside>

						<article className="space-y-14">
							<section>
								<SectionHeader id="problem" title={c.sections.problem} />
								<div className="space-y-4 text-[15px] text-zinc-300/90 leading-8">
									{c.problemParagraphs.map((p) => (
										<p key={p}>{p}</p>
									))}
								</div>
							</section>

							<section>
								<SectionHeader id="principles" title={c.sections.principles} />
								<div className="grid sm:grid-cols-2 gap-4">
									{c.principles.map((item) => (
										<div key={item.title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
											<div className="flex items-center gap-2 mb-2.5">
												<ShieldCheck className="w-4 h-4 text-emerald-400" />
												<h3 className="text-[15px] font-semibold text-zinc-100">{item.title}</h3>
											</div>
											<p className="text-[13px] text-zinc-400 leading-6">{item.description}</p>
										</div>
									))}
								</div>
							</section>

							<section>
								<SectionHeader id="pipeline" title={c.sections.pipeline} />
								<div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 mb-5">
									<div className="flex items-center gap-2 mb-2">
										<Workflow className="w-4 h-4 text-blue-400" />
										<p className="text-[12px] text-zinc-400">Pipeline skeleton</p>
									</div>
									<pre className="text-[12px] sm:text-[13px] text-zinc-300 font-mono leading-6 whitespace-pre-wrap">{CODE_SNIPPET}</pre>
								</div>
								<div className="space-y-3">
									{c.pipeline.map((item) => (
										<div key={item.phase} className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-5">
											<div className="flex items-center gap-2 mb-3">
												<GitBranch className="w-4 h-4 text-blue-400" />
												<h3 className="text-[15px] font-semibold text-zinc-100">{item.phase}</h3>
											</div>
											<div className="grid md:grid-cols-3 gap-3 text-[13px]">
												<p className="text-zinc-400 leading-6"><span className="text-zinc-200 font-medium">Goal:</span> {item.goal}</p>
												<p className="text-zinc-400 leading-6"><span className="text-zinc-200 font-medium">How:</span> {item.how}</p>
												<p className="text-zinc-400 leading-6"><span className="text-zinc-200 font-medium">Output:</span> {item.output}</p>
											</div>
										</div>
									))}
								</div>
							</section>

							<section>
								<SectionHeader id="safety" title={c.sections.safety} />
								<div className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-5">
									<div className="grid sm:grid-cols-2 gap-3">
										{c.safetyItems.map((item) => (
											<div key={item} className="flex items-start gap-2.5">
												<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
												<p className="text-[13px] text-zinc-300 leading-6">{item}</p>
											</div>
										))}
									</div>
								</div>
							</section>

							<section>
								<SectionHeader id="operations" title={c.sections.operations} />
								<div className="space-y-3">
									{c.risks.map((r) => (
										<div key={r.risk} className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-5">
											<div className="flex items-center gap-2 mb-2">
												<Layers className="w-4 h-4 text-amber-400" />
												<h3 className="text-[15px] font-semibold text-zinc-100">{r.risk}</h3>
											</div>
											<p className="text-[13px] text-zinc-400 leading-6">{r.mitigation}</p>
										</div>
									))}
								</div>
							</section>

							<section>
								<SectionHeader id="guide" title={c.sections.guide} />
								<ul className="space-y-2 text-[14px] text-zinc-300 leading-7 list-disc pl-5 marker:text-zinc-600">
									{c.operatorGuide.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</section>

							<section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 sm:p-7">
								<h3 className="text-[22px] sm:text-[26px] font-bold tracking-tight mb-3">{c.closingTitle}</h3>
								<p className="text-[15px] text-zinc-300/90 leading-8 mb-5">{c.closingParagraph}</p>
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
