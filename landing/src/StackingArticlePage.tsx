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
	title: "How PR Stacking Works: Dependency-Safe Splitting for Large Pull Requests",
	subtitle:
		"A practical breakdown of how newpr converts one massive pull request into a chain of smaller draft PRs without changing the final tree.",
	updated: "Updated for v1.0.13",
	readingTime: "~8 min read",
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
		"PR stacking solves this by preserving one logical feature while splitting delivery into smaller review units. Instead of asking reviewers to validate 40 files at once, it presents a sequence where each PR has a narrower concern and clearer dependency boundary.",
		"The hard part is correctness. If splitting changes behavior, stacking becomes dangerous. So the algorithm is built around invariants that guarantee the final result is equivalent to the original pull request.",
	],
	principles: [
		{
			title: "Tree Equivalence Over Convenience",
			description:
				"The top-level invariant is strict: the final stacked tree must match the original PR head tree exactly. Any deviation is a hard failure, not a warning.",
		},
		{
			title: "Dependency-Aware Ordering",
			description:
				"Groups are ordered by actual file and change dependencies, not by filename or commit timestamp. This prevents broken intermediate PRs.",
		},
		{
			title: "Git Plumbing, Not Patch Guessing",
			description:
				"The stack is built using tree/index operations instead of patch/cherry-pick workflows. This minimizes ambiguity and merge-shape drift.",
		},
		{
			title: "Fail Fast on Infeasible Plans",
			description:
				"If cycles or unsplittable coupling are detected, the pipeline stops early with explicit diagnostics instead of producing misleading output.",
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
			how: "Build a normalized change graph from file-level and hunk-level differences.",
			output: "Machine-usable delta objects instead of raw text diffs.",
		},
		{
			phase: "3) Initial Partitioning",
			goal: "Assign changed files into candidate concern groups.",
			how: "Combine existing analysis groups with AI classification for unassigned or ambiguous files.",
			output: "Initial ownership map plus reattribution warnings.",
		},
		{
			phase: "4) Coupling and Rebalance",
			goal: "Reduce unsafe cross-group dependencies.",
			how: "Apply coupling rules, split oversized groups, rebalance edges, and merge empty groups.",
			output: "A cleaner grouping set with fewer hidden cross-cutting edges.",
		},
		{
			phase: "5) Feasibility Check",
			goal: "Prove the grouping can form a valid stack.",
			how: "Run cycle detection and ordering feasibility checks before any execution.",
			output: "Topological order or an explicit infeasibility error.",
		},
		{
			phase: "6) Plan Generation",
			goal: "Create a concrete stack plan with expected trees.",
			how: "Build per-group commit plan, dependency edges, and predicted tree hashes.",
			output: "Executable plan with deterministic expectations.",
		},
		{
			phase: "7) Stack Execution",
			goal: "Materialize branch/commit chain in order.",
			how: "Apply group deltas onto the planned ancestry and create commits per group.",
			output: "A branch hierarchy ready for draft PR publishing.",
		},
		{
			phase: "8) Verification",
			goal: "Verify output is semantically identical to original PR.",
			how: "Compare resulting tree state against original head tree and run invariant checks.",
			output: "Verified stack or hard failure with error context.",
		},
	],
	safetyItems: [
		"Invariant: tree(stackTop) == tree(originalHEAD)",
		"Intermediate PRs remain reviewable and dependency-consistent",
		"Warnings are structured and surfaced (assignment, grouping, verification)",
		"Server-side state can be restored from sidecar snapshots",
	],
	risks: [
		{
			risk: "Over-coupled change set",
			mitigation: "Coupling rules + split/rebalance steps + feasibility gate prevent unsafe decomposition.",
		},
		{
			risk: "AI misclassification of file ownership",
			mitigation: "Backfill ownership, emit explicit warnings, and validate through dependency checks.",
		},
		{
			risk: "Repository state drift (missing SHAs)",
			mitigation: "Required SHA verification forces fetch when base/head objects are missing.",
		},
		{
			risk: "Execution mismatch vs source PR",
			mitigation: "Final tree-equivalence verification fails hard before completion.",
		},
	],
	operatorGuide: [
		"Use stacking when one PR has multiple concerns (schema + API + UI + tests) but still belongs to one feature thread.",
		"Treat each generated PR as a review layer: foundation first, integration second, UX/tests last.",
		"If feasibility fails, reduce max group pressure or manually simplify coupling hotspots before rerunning.",
		"Use stacked draft PRs to parallelize review feedback while preserving merge order.",
	],
	closingTitle: "Why this matters",
	closingParagraph:
		"PR stacking is not just a UI convenience. It is a correctness-constrained transformation from one large review unit into many smaller ones. Done right, it improves reviewer throughput, reduces cognitive load, and keeps delivery semantics intact.",
};

const KO_CONTENT: ArticleContent = {
	htmlLang: "ko",
	pageTitle: "PR Stacking 원리",
	badge: "엔지니어링 딥다이브",
	title: "PR Stacking은 어떻게 동작할까: 대형 PR을 안전하게 분해하는 원리",
	subtitle:
		"newpr가 하나의 거대한 PR을 최종 결과를 바꾸지 않고 여러 개의 작은 Draft PR 체인으로 분해하는 과정을 실제 파이프라인 기준으로 설명합니다.",
	updated: "v1.0.13 기준",
	readingTime: "약 8분",
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
		"PR stacking은 하나의 기능 흐름은 유지하면서 리뷰 단위를 작게 나눕니다. 리뷰어는 40개 파일을 한 번에 보는 대신, 의존성이 정리된 순서대로 작은 PR을 검토할 수 있습니다.",
		"중요한 건 정확성입니다. 분할 과정에서 동작이 달라지면 stacking은 오히려 위험해집니다. 그래서 newpr의 스택 파이프라인은 결과 동일성 보장을 최우선 불변조건으로 둡니다.",
	],
	principles: [
		{
			title: "편의보다 트리 동일성",
			description:
				"최종 불변식은 명확합니다. stack의 마지막 트리는 원본 PR의 head 트리와 완전히 동일해야 합니다. 어긋나면 성공이 아니라 실패입니다.",
		},
		{
			title: "의존성 기반 순서화",
			description:
				"파일명이나 커밋 시간 순서가 아니라, 실제 변경 의존성을 기반으로 PR 순서를 만듭니다. 중간 PR이 깨지는 상황을 방지합니다.",
		},
		{
			title: "Patch 추측 대신 Git plumbing",
			description:
				"cherry-pick/patch 중심 접근이 아니라 tree/index 기반으로 실행하여 애매한 재적용 오차를 줄입니다.",
		},
		{
			title: "불가능한 계획은 빠르게 실패",
			description:
				"순환 의존이나 분해 불가능 결합이 탐지되면 일찍 중단하고, 이유를 구조화된 경고/에러로 노출합니다.",
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
			how: "raw diff를 파일/변경 단위의 정규화된 delta로 변환합니다.",
			output: "후속 의존성 계산에 쓸 수 있는 delta 객체",
		},
		{
			phase: "3) 1차 그룹 분할",
			goal: "변경 파일을 관심사 단위 그룹에 배치합니다.",
			how: "기존 분석 그룹 + AI 분류를 조합해 미할당/모호 파일을 재배치합니다.",
			output: "초기 ownership 맵 + 재배치 경고",
		},
		{
			phase: "4) 결합 완화와 리밸런싱",
			goal: "그룹 간 위험한 교차 의존을 줄입니다.",
			how: "coupling 규칙 적용, oversized 그룹 분리, 재균형, empty 그룹 병합을 수행합니다.",
			output: "실행 가능한 품질의 그룹 세트",
		},
		{
			phase: "5) 실행 가능성 검증",
			goal: "이 그룹 구조가 실제 스택이 될 수 있는지 증명합니다.",
			how: "순환 의존 탐지와 위상 정렬 가능성 검사를 실행 전 선검증합니다.",
			output: "정렬 순서 또는 명시적 infeasible 에러",
		},
		{
			phase: "6) 계획 생성",
			goal: "예상 트리 해시를 포함한 실행 계획을 만듭니다.",
			how: "그룹별 커밋 계획, 의존 edge, expected tree를 계산합니다.",
			output: "결정적 실행 플랜",
		},
		{
			phase: "7) 스택 실행",
			goal: "브랜치/커밋 체인을 실제로 생성합니다.",
			how: "계획된 순서대로 그룹 델타를 적용하고 그룹별 커밋을 작성합니다.",
			output: "Draft PR 발행 가능한 브랜치 계층",
		},
		{
			phase: "8) 결과 검증",
			goal: "원본 PR과 결과가 동일함을 확인합니다.",
			how: "최종 트리와 원본 head 트리를 비교하고 불변식을 검증합니다.",
			output: "검증 성공 또는 즉시 실패",
		},
	],
	safetyItems: [
		"불변식: tree(stackTop) == tree(originalHEAD)",
		"중간 PR도 리뷰 가능한 상태를 유지하는 의존성 순서",
		"assignment/grouping/verification 경고를 구조화해서 표출",
		"서버 재시작 이후에도 sidecar 스냅샷 복구 가능",
	],
	risks: [
		{
			risk: "변경이 과도하게 결합된 경우",
			mitigation: "coupling 규칙 + split/rebalance + feasibility gate로 분해 불가능 케이스를 사전 차단합니다.",
		},
		{
			risk: "AI 파일 분류 오차",
			mitigation: "fallback ownership과 경고를 남기고, 의존성 검증 단계에서 추가 필터링합니다.",
		},
		{
			risk: "base/head SHA 누락",
			mitigation: "required SHA 검증 후 누락 시 강제 fetch하여 잘못된 기준점 실행을 방지합니다.",
		},
		{
			risk: "실행 결과가 원본과 달라지는 경우",
			mitigation: "최종 tree-equivalence 검증에서 하드 실패 처리합니다.",
		},
	],
	operatorGuide: [
		"하나의 PR 안에 스키마/API/UI/테스트처럼 서로 다른 관심사가 섞여 있을 때 stacking 효과가 가장 큽니다.",
		"생성된 PR을 '기반 계층 → 통합 계층 → UX/테스트 계층' 순서로 리뷰하면 의도 파악이 빠릅니다.",
		"feasibility 실패 시 max group 강도를 낮추거나 결합 지점을 먼저 정리한 뒤 재실행하세요.",
		"Draft PR 체인을 활용하면 병렬 피드백과 순차 머지를 동시에 가져갈 수 있습니다.",
	],
	closingTitle: "핵심 요약",
	closingParagraph:
		"PR stacking은 UI 편의 기능이 아니라, 정합성을 강하게 보장하는 변환 파이프라인입니다. 올바르게 동작하면 리뷰 처리량을 높이고 인지 부하를 줄이면서도 최종 결과의 의미를 그대로 유지합니다.",
};

const CODE_SNIPPET = `extractDeltas -> partitionGroups -> applyCouplingRules
    -> splitOversizedGroups -> rebalanceGroups
    -> checkFeasibility -> createStackPlan
    -> executeStack -> verifyStack`;

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
