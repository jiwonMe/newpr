import React, { useState, useEffect, useRef } from "react";
import { BookOpen, Link, MessageSquare, Bot, Presentation, CheckCircle, Palette, Stethoscope, Plug, Copy, Check, ChevronRight, Terminal, GitPullRequest, ArrowRight, Sparkles, Code, Layers, Search, Globe, Play } from "lucide-react";

function useInView(threshold = 0.15) {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const obs = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
		obs.observe(el);
		return () => obs.disconnect();
	}, [threshold]);
	return { ref, visible };
}

function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
	const { ref, visible } = useInView();
	return (
		<div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
			{children}
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
			className="shrink-0 border border-zinc-700 text-zinc-500 text-[11px] px-2 py-1 rounded-md hover:text-zinc-300 hover:border-zinc-500 transition-colors flex items-center gap-1">
			{copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
		</button>
	);
}

function TypewriterCode() {
	const lines = [
		{ text: "$ bunx newpr --web", color: "text-emerald-400", delay: 0 },
		{ text: "", color: "", delay: 800 },
		{ text: "  Preflight", color: "text-white", delay: 1000 },
		{ text: "  ✓ gh 2.62.0 · jiwonMe", color: "text-emerald-400", delay: 1200 },
		{ text: "  ✓ claude 1.0.3", color: "text-emerald-400", delay: 1400 },
		{ text: "  ✓ OpenRouter API key", color: "text-emerald-400", delay: 1600 },
		{ text: "", color: "", delay: 1800 },
		{ text: "  newpr v1.0", color: "text-white", delay: 2000 },
		{ text: "  → Local    http://localhost:3456", color: "text-blue-400", delay: 2200 },
		{ text: "  → Model    claude-sonnet-4.6", color: "text-zinc-500", delay: 2400 },
	];
	const [visibleCount, setVisibleCount] = useState(0);
	const { ref, visible } = useInView(0.3);
	useEffect(() => {
		if (!visible) return;
		const timers = lines.map((l, i) => setTimeout(() => setVisibleCount(i + 1), l.delay));
		return () => timers.forEach(clearTimeout);
	}, [visible]);
	return (
		<div ref={ref} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 font-mono text-[13px] leading-6 overflow-hidden">
			<div className="flex gap-2 mb-4">
				<span className="w-3 h-3 rounded-full bg-zinc-800" />
				<span className="w-3 h-3 rounded-full bg-zinc-800" />
				<span className="w-3 h-3 rounded-full bg-zinc-800" />
			</div>
			{lines.slice(0, visibleCount).map((l, i) => (
				<div key={i} className={`${l.color} ${i === visibleCount - 1 ? "animate-pulse" : ""}`}>{l.text || " "}</div>
			))}
			{visibleCount < lines.length && <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse" />}
		</div>
	);
}

function AnchorDemoKo() {
	const [active, setActive] = useState<number | null>(null);
	const items = [
		{ type: "group", label: "Auth Flow", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
		{ type: "file", label: "session.ts", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
		{ type: "line", label: "JWT 토큰을 검증하고 만료를 확인", color: "" },
	];
	return (
		<div className="space-y-4">
			<p className="text-[13px] text-zinc-400 leading-relaxed">
				<button onClick={() => setActive(0)} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border transition-all ${active === 0 ? "bg-blue-500 text-white border-blue-500" : items[0]!.color}`}>
					{items[0]!.label}
				</button>{" "}
				그룹은 세션 관리를 도입합니다. 핵심 변경은{" "}
				<button onClick={() => setActive(1)} className={`inline px-1.5 py-0.5 rounded-md text-[11px] font-mono border transition-all ${active === 1 ? "bg-blue-500 text-white border-blue-500" : items[1]!.color}`}>
					{items[1]!.label}
				</button>{" "}
				에서 새로운 함수가{" "}
				<button onClick={() => setActive(2)} className={`inline underline transition-all cursor-pointer ${active === 2 ? "decoration-blue-500 decoration-2 bg-blue-500/10 rounded" : "decoration-white/30 decoration-1"} underline-offset-[3px]`}>
					{items[2]!.label}
				</button>
				하는 부분입니다.
			</p>
			<div className={`text-[11px] text-zinc-500 transition-all duration-300 ${active !== null ? "opacity-100" : "opacity-0"}`}>
				{active === 0 && "→ 사이드바에서 그룹 상세 열기"}
				{active === 1 && "→ 사이드바에서 파일 diff 열기"}
				{active === 2 && "→ diff를 L24-L35 위치로 스크롤"}
			</div>
		</div>
	);
}

function AppMockup() {
	return (
		<div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl shadow-black/50">
			<div className="flex h-[420px] sm:h-[480px]">
				<div className="w-[180px] border-r border-zinc-800 flex flex-col shrink-0 hidden sm:flex">
					<div className="h-10 px-3 flex items-center border-b border-zinc-800">
						<span className="font-mono text-[11px] font-semibold text-zinc-300">newpr</span>
						<span className="text-[9px] text-zinc-600 ml-1.5">v1.0</span>
					</div>
					<div className="flex-1 px-2 py-2 space-y-0.5 overflow-hidden">
						<div className="text-[9px] text-zinc-600 px-2 py-1 font-mono">tldraw/tldraw</div>
						<div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-800/80">
							<span className="w-1.5 h-1.5 rounded-full bg-green-500" />
							<span className="text-[10px] text-zinc-300 truncate">Add loop node support</span>
						</div>
						<div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-zinc-800/40">
							<span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
							<span className="text-[10px] text-zinc-500 truncate">Refactor shape utils</span>
						</div>
						<div className="text-[9px] text-zinc-600 px-2 py-1 font-mono mt-2">vercel/next.js</div>
						<div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-zinc-800/40">
							<span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
							<span className="text-[10px] text-zinc-500 truncate">Fix turbopack HMR</span>
						</div>
					</div>
					<div className="border-t border-zinc-800 px-3 py-2">
						<div className="flex items-center gap-2">
							<div className="w-5 h-5 rounded-full bg-zinc-700" />
							<span className="text-[10px] text-zinc-500">jiwonMe</span>
						</div>
					</div>
				</div>

				<div className="flex-1 flex flex-col min-w-0">
					<div className="px-4 pt-3 pb-2 border-b border-zinc-800">
						<div className="flex items-center gap-2 mb-2">
							<span className="text-[10px] text-zinc-600 font-mono">tldraw/tldraw</span>
							<span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Open</span>
							<span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
						</div>
						<h3 className="text-[13px] font-semibold mb-2 truncate">Add loop node support for workflow editor</h3>
						<div className="flex items-center gap-3 text-[10px] text-zinc-600 mb-3">
							<span>main ← feat/loop-node</span>
							<span className="text-green-500">+2,847</span>
							<span className="text-red-500">-342</span>
							<span>48 files</span>
						</div>
						<div className="flex gap-0 border-b border-zinc-800 -mb-2">
							{["스토리", "디스커션", "그룹", "파일", "슬라이드"].map((tab, i) => (
								<button key={tab} className={`px-3 pb-2 text-[11px] border-b-2 transition-colors ${i === 0 ? "text-white border-white font-medium" : "text-zinc-600 border-transparent"}`}>{tab}</button>
							))}
						</div>
					</div>

					<div className="flex-1 px-4 py-4 overflow-hidden">
						<div className="space-y-3">
							<div className="text-[9px] text-zinc-600 uppercase tracking-widest">워크스루</div>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								<span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">Loop Node Schema</span> 그룹은 핵심 데이터 구조를 정의합니다.{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">새로운 loopProperties 스키마</span>는 반복 유형, 횟수, 최대 반복을 지정하고,{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">SubworkflowBody 스키마</span>는 내부 노드와 링크 배열을 정의합니다.
							</p>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								이를 기반으로 <span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">State Management</span> 그룹은{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">경계 간 노드 이동 핸들러</span>를 구현하여{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">루프 진입/탈출 검증</span>과{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">서브워크플로우 상태 동기화</span>를 관리합니다.
							</p>

							<div className="border-t border-zinc-800 pt-3 mt-4">
								<div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">대화</div>
								<p className="text-[10px] text-zinc-500">이 PR에 대해 무엇이든 물어보세요</p>
							</div>
						</div>
					</div>

					<div className="px-4 pb-3 pt-1 border-t border-zinc-800">
						<div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
							<span className="text-[11px] text-zinc-600 flex-1">PR에 대해 질문하기...</span>
							<div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
								<ChevronRight className="w-3 h-3 text-black" />
							</div>
						</div>
					</div>
				</div>

				<div className="w-[220px] border-l border-zinc-800 flex-col hidden lg:flex">
					<div className="h-10 px-3 flex items-center justify-between border-b border-zinc-800">
						<div className="flex items-center gap-1.5">
							<span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
							<span className="text-[10px] font-mono text-zinc-400 truncate">loop.ts</span>
						</div>
						<span className="text-[9px] text-green-500">+87</span>
					</div>
					<div className="flex-1 px-1 py-1 font-mono text-[9px] leading-[18px] overflow-hidden">
						<div className="flex text-zinc-600"><span className="w-7 text-right pr-2 select-none">37</span><span className="text-zinc-500">export const loopProperties =</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">38</span><span className="text-green-400">+ z.object({'{'}</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">39</span><span className="text-green-400">+   loop_type: z.enum([</span></div>
						<div className="flex bg-green-500/8 bg-blue-500/10"><span className="w-7 text-right pr-2 select-none text-green-600">40</span><span className="text-green-400">+     "for_each", "while",</span></div>
						<div className="flex bg-green-500/8 bg-blue-500/10"><span className="w-7 text-right pr-2 select-none text-green-600">41</span><span className="text-green-400">+     "repeat"</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">42</span><span className="text-green-400">+   ]),</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">43</span><span className="text-green-400">+   repeat_count: z.number()</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">44</span><span className="text-green-400">+     .optional(),</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">45</span><span className="text-green-400">+   max_iterations: z.number()</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">46</span><span className="text-green-400">+     .default(100),</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">47</span><span className="text-green-400">+   body: subworkflowBody,</span></div>
						<div className="flex bg-green-500/8"><span className="w-7 text-right pr-2 select-none text-green-600">48</span><span className="text-green-400">+ {'}'});</span></div>
						<div className="flex text-zinc-600"><span className="w-7 text-right pr-2 select-none">49</span></div>
						<div className="flex text-zinc-600"><span className="w-7 text-right pr-2 select-none">50</span><span className="text-zinc-500">export type LoopNode =</span></div>
					</div>
				</div>
			</div>
		</div>
	);
}

function StackMockup() {
	const stacks = [
		{ order: 1, type: "feat", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", title: "loop node 스키마 추가", plus: 247, minus: 12 },
		{ order: 2, type: "feat", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", title: "상태 관리 구현", plus: 189, minus: 34 },
		{ order: 3, type: "refactor", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", title: "캔버스 렌더링 개선", plus: 156, minus: 87 },
		{ order: 4, type: "test", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", title: "통합 테스트 추가", plus: 312, minus: 0 },
	];
	return (
		<div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl shadow-black/50 p-6 sm:p-8">
			<div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
				<div className="flex-shrink-0 w-full lg:w-auto">
					<div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 w-full lg:w-[200px]">
						<div className="flex items-center gap-2 mb-3">
							<GitPullRequest className="w-4 h-4 text-red-400" />
							<span className="text-[11px] text-zinc-400 font-medium">원본 PR</span>
						</div>
						<p className="text-[13px] font-semibold text-zinc-200 mb-3 leading-snug">Add loop node support for workflow editor</p>
						<div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-3">
							<span className="text-green-500">+904</span>
							<span className="text-red-500">-133</span>
						</div>
						<div className="text-[10px] text-zinc-600">48개 파일 변경</div>
					</div>
				</div>

				<div className="flex-shrink-0 flex flex-col items-center gap-1">
					<div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
						<Layers className="w-4 h-4 text-blue-400" />
					</div>
					<ArrowRight className="w-4 h-4 text-zinc-600 hidden lg:block" />
					<ChevronRight className="w-4 h-4 text-zinc-600 rotate-90 lg:hidden" />
				</div>

				<div className="flex-1 space-y-2 w-full">
					{stacks.map((s, i) => (
						<div key={i} className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-2.5 hover:border-zinc-700 transition-colors group">
							<div className="flex items-center gap-2 shrink-0">
								<span className="text-[10px] text-zinc-600 w-4 text-right">{s.order}</span>
								<div className="w-px h-4 bg-zinc-800" />
								<span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${s.color}`}>{s.type}</span>
							</div>
							<span className="text-[12px] text-zinc-300 truncate flex-1 group-hover:text-white transition-colors">{s.title}</span>
							<div className="flex items-center gap-2 text-[10px] shrink-0">
								<span className="text-green-500">+{s.plus}</span>
								<span className="text-red-500">-{s.minus}</span>
							</div>
							{i < stacks.length - 1 && (
								<div className="absolute right-0 bottom-0 hidden" />
							)}
						</div>
					))}
					<div className="flex items-center gap-2 pt-1">
						<div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
						<span className="text-[10px] text-zinc-600">각 PR은 독립적으로 리뷰 가능</span>
						<div className="h-px flex-1 bg-gradient-to-l from-zinc-800 to-transparent" />
					</div>
				</div>
			</div>
		</div>
	);
}

const FEATURES = [
	{ icon: Layers, title: "PR 스태킹", desc: "거대한 PR을 작고 리뷰하기 쉬운 스택 PR로 분할합니다. AI가 파일을 관심사별로 그룹화하고, 브랜치 계층을 생성하며, 연결된 드래프트 PR로 발행합니다." },
	{ icon: Play, title: "백그라운드 처리", desc: "스택 파이프라인이 서버에서 실행되며 SSE로 진행 상황을 스트리밍합니다. 어느 기기에서든 이어서 작업할 수 있습니다." },
	{ icon: BookOpen, title: "내러티브 워크스루", desc: "클릭 가능한 코드 참조가 포함된 산문 형식의 스토리. 모든 문장이 diff의 정확한 라인으로 연결됩니다." },
	{ icon: Link, title: "라인 레벨 앵커", desc: "그룹 칩, 파일 칩, 인라인 밑줄 링크 세 가지 앵커 타입으로 정확한 라인 범위로 스크롤합니다." },
	{ icon: MessageSquare, title: "대화형 채팅", desc: "에이전트 도구 실행으로 후속 질문을 할 수 있습니다. 채팅에서 리뷰 코멘트를 직접 작성합니다." },
	{ icon: Bot, title: "에이전트 탐색", desc: "Claude, OpenCode 또는 Codex가 프로젝트 구조, 의존성, 이슈를 파악하기 위해 전체 코드베이스를 탐색합니다." },
	{ icon: Presentation, title: "슬라이드 덱", desc: "자동 생성되는 프레젠테이션. Opus가 스타일을 디자인하고, Gemini가 각 슬라이드를 순차적으로 렌더링합니다." },
	{ icon: CheckCircle, title: "리뷰 액션", desc: "승인, 변경 요청, 코멘트를 직접 수행합니다. 특정 라인에 인라인 리뷰 코멘트를 작성합니다." },
	{ icon: Palette, title: "코믹 스트립", desc: "PR 변경 사항을 유머러스하게 시각화하는 4컷 만화. Gemini 이미지 생성으로 구동됩니다." },
	{ icon: Stethoscope, title: "React Doctor", desc: "React 프로젝트를 자동 감지하고 보안, 성능, 아키텍처 품질 점수를 산출합니다." },
	{ icon: Plug, title: "플러그인 시스템", desc: "확장 가능한 아키텍처. 설정에서 슬라이드나 코믹 같은 생성기를 활성화/비활성화할 수 있습니다." },
];

const STEPS = [
	{ icon: GitPullRequest, title: "PR URL 붙여넣기", desc: "아무 GitHub PR 링크. API에서 메타데이터, 커밋, diff, 디스커션을 가져옵니다." },
	{ icon: Search, title: "클론 & 탐색", desc: "AI 에이전트가 레포를 클론하고 전체 코드베이스를 탐색합니다 — 구조, 임포트, 테스트." },
	{ icon: Layers, title: "분석 & 그룹화", desc: "파일을 병렬로 요약한 후 위험 평가와 함께 논리적 그룹으로 클러스터링합니다." },
	{ icon: Code, title: "내러티브 생성", desc: "정확한 diff를 가리키는 라인 레벨 코드 참조가 포함된 산문 워크스루를 작성합니다." },
	{ icon: MessageSquare, title: "리뷰 & 채팅", desc: "분석을 탐색하고, 앵커를 클릭하여 코드를 탐색하고, 채팅으로 심층 분석하고, 리뷰를 제출합니다." },
];

const TOOLS = [
	{ name: "get_file_diff", desc: "파일의 unified diff 조회", icon: Code },
	{ name: "create_review_comment", desc: "특정 라인에 인라인 코멘트 작성", icon: MessageSquare },
	{ name: "submit_review", desc: "승인, 변경 요청 또는 코멘트", icon: CheckCircle },
	{ name: "web_search", desc: "에이전트 위임으로 웹 검색", icon: Globe },
	{ name: "run_react_doctor", desc: "React 코드 품질 분석", icon: Stethoscope },
];

const STATS = [
	{ value: "10k+", label: "PR당 처리 라인" },
	{ value: "10+", label: "채팅 & 리뷰 도구" },
	{ value: "<2분", label: "전체 분석 소요" },
	{ value: "1 to N", label: "하나의 PR에서" },
];

export function LandingKo() {
	return (
		<>
			<div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-[#0d1b33]/90 backdrop-blur-sm py-1.5 border-b border-blue-500/10">
				<a href="https://www.sionic.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity">
					<span className="text-[11px] text-zinc-400 uppercase tracking-widest">Sponsored by</span>
					<img src="https://www.sionic.ai/favicon.ico" alt="Sionic AI" className="h-4 w-4" />
					<span className="text-[13px] text-zinc-200 font-medium">Sionic AI</span>
				</a>
			</div>
			<nav className="fixed top-8 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
				<div className="max-w-[1080px] mx-auto px-6 h-14 flex items-center justify-between">
					<a href="/newpr/ko/" className="font-mono text-sm font-semibold tracking-tight">newpr</a>
					<div className="flex items-center gap-5">
						<a href="#stacking" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"스태킹"}</a>
						<a href="/newpr/ko/stacking-principles.html" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"아티클"}</a>
						<a href="#features" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"기능"}</a>
						<a href="#how" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"작동 방식"}</a>
						<a href="#tools" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"도구"}</a>
						<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">GitHub</a>
						<a href="/newpr/" className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">EN</a>
						<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-8 px-3.5 bg-white text-black text-[13px] font-medium rounded-lg flex items-center hover:bg-zinc-200 transition-colors">{"설치"}</a>
					</div>
				</div>
			</nav>

			<section className="pt-40 sm:pt-48 pb-16 text-center px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[12px] text-blue-400 font-medium mb-6">
							<span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
							{"오픈소스 · MIT 라이선스"}
						</div>
					</FadeIn>
					<FadeIn delay={100}>
						<h1 className="text-4xl sm:text-5xl lg:text-[64px] font-bold tracking-[-0.04em] leading-[1.08] mb-6">
							<span className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">{"거대한 PR을 리뷰하고"}</span>
							<br />
							<span className="bg-gradient-to-b from-blue-400 to-blue-600 bg-clip-text text-transparent">{"스택으로 분할하세요"}</span>
						</h1>
					</FadeIn>
					<FadeIn delay={200}>
						<p className="text-base sm:text-lg text-zinc-400 max-w-[560px] mx-auto mb-10 leading-relaxed">
							{"거대한 PR을 내러티브 워크스루로 변환하고, 작고 리뷰하기 쉬운 스택 PR로 분할합니다 — 명령어 하나로."}
						</p>
					</FadeIn>
					<FadeIn delay={300}>
						<div className="flex items-center justify-center gap-3 flex-wrap mb-6">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								{"시작하기"} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="#demo" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center gap-2 hover:text-white hover:border-zinc-600 transition-colors">
								<Play className="w-3.5 h-3.5" /> {"작동 방식 보기"}
							</a>
						</div>
					</FadeIn>
					<FadeIn delay={400}>
						<div className="max-w-[400px] mx-auto bg-zinc-900/80 border border-zinc-800 rounded-xl px-5 py-3.5 flex items-center gap-3">
							<Terminal className="w-4 h-4 text-zinc-600 shrink-0" />
							<code className="flex-1 font-mono text-[13px] text-zinc-400 text-left">
								<span className="text-emerald-400">$</span> bunx newpr --web
							</code>
							<CopyButton text="bunx newpr --web" />
						</div>
					</FadeIn>
				<FadeIn delay={500}>
						<div className="mt-16 max-w-[960px] mx-auto">
							<AppMockup />
						</div>
					</FadeIn>
				</div>
			</section>

			<section className="py-10 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 rounded-2xl overflow-hidden">
							{STATS.map((s) => (
								<div key={s.label} className="bg-[#09090b] p-6 sm:p-8 text-center">
									<div className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">{s.value}</div>
									<div className="text-[12px] text-zinc-500">{s.label}</div>
								</div>
							))}
						</div>
					</FadeIn>
				</div>
			</section>

			<section id="stacking" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="text-center mb-12">
							<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[12px] text-emerald-400 font-medium mb-4">
								v1.0 {"신기능"}
							</div>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"하나의 PR을 리뷰 가능한 스택으로 분할"}</h2>
							<p className="text-[15px] text-zinc-400 max-w-[560px] mx-auto leading-relaxed">
								{"AI가 파일 의존성을 분석하고, 관심사별로 변경사항을 그룹화하고, 작고 집중된 PR 체인을 생성합니다 — 각각 이전 PR 위에 쌓입니다."}
							</p>
							<a href="/newpr/ko/stacking-principles.html" className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-blue-400 hover:text-blue-300 transition-colors">
								{"원리 아티클 읽기"} <ArrowRight className="w-3.5 h-3.5" />
							</a>
						</div>
					</FadeIn>
					<FadeIn delay={200}>
						<div className="max-w-[860px] mx-auto">
							<StackMockup />
						</div>
					</FadeIn>
					<FadeIn delay={400}>
						<div className="grid sm:grid-cols-3 gap-4 mt-10 max-w-[860px] mx-auto">
							{[
								{ title: "의존성 인지 순서", desc: "위상 정렬로 각 PR이 부모 PR 위에 깨끗하게 빌드됩니다. 중간에 깨지는 상태가 없습니다." },
								{ title: "Git plumbing만 사용", desc: "cherry-pick이나 patch 없이 순수 트리 조작과 인덱스 전용 연산으로 완벽한 정확도를 보장합니다." },
								{ title: "연결된 드래프트 PR", desc: "GitHub에 연결된 드래프트 PR로 발행합니다. 각 PR은 스택에서 부모 PR을 참조합니다." },
							].map((item, i) => (
								<div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
									<h3 className="text-[14px] font-semibold mb-2">{item.title}</h3>
									<p className="text-[12px] text-zinc-500 leading-relaxed">{item.desc}</p>
								</div>
							))}
						</div>
					</FadeIn>
				</div>
			</section>

			<section id="demo" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
					<div>
						<FadeIn>
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"빠른 시작"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"몇 초 만에 실행"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"명령어 하나로 웹 UI가 실행됩니다. newpr이 설치된 도구를 감지하고, GitHub CLI로 연결하고, 브라우저를 자동으로 엽니다."}
							</p>
							<div className="space-y-3 text-[13px]">
								{[
									"Claude, OpenCode, Codex 자동 감지",
									"gh CLI로 GitHub 인증",
									"실행 시 브라우저 자동 열기",
									"모든 공개/비공개 레포 지원",
								].map((t) => (
									<div key={t} className="flex items-center gap-2.5 text-zinc-400">
										<Check className="w-4 h-4 text-emerald-400 shrink-0" />
										{t}
									</div>
								))}
							</div>
						</FadeIn>
					</div>
					<FadeIn delay={200}>
						<TypewriterCode />
					</FadeIn>
				</div>
			</section>

			<section className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
					<FadeIn delay={200} className="order-2 lg:order-1">
						<div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
							<AnchorDemoKo />
						</div>
					</FadeIn>
					<div className="order-1 lg:order-2">
						<FadeIn>
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"내비게이션"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"모든 설명이 출처와 연결됩니다"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"위키피디아 문서처럼 내러티브는 조밀하게 링크되어 있습니다. 그룹 앵커는 상세 정보를, 파일 앵커는 diff를, 라인 앵커는 정확한 코드 위치로 스크롤합니다."}
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								{"목표 밀도: 단락당 3–6개 라인 앵커. 모든 함수, 타입, 설정 변경, 임포트가 각각 클릭 가능한 참조를 가집니다."}
							</p>
						</FadeIn>
					</div>
				</div>
			</section>

			<section id="features" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"기능"}</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">{"거대한 PR을 리뷰하고 분할하는 데 필요한 모든 것"}</h2>
					</FadeIn>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800 rounded-2xl overflow-hidden">
						{FEATURES.map((f, i) => {
							const Icon = f.icon;
							return (
								<FadeIn key={i} delay={i * 60}>
									<div className="bg-[#09090b] p-7 h-full group hover:bg-zinc-900/50 transition-colors">
										<div className="w-9 h-9 rounded-[10px] bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
											<Icon className="w-[18px] h-[18px] text-blue-400" />
										</div>
										<h3 className="text-[15px] font-semibold mb-2 tracking-tight">{f.title}</h3>
										<p className="text-[13px] text-zinc-400 leading-relaxed">{f.desc}</p>
									</div>
								</FadeIn>
							);
						})}
					</div>
				</div>
			</section>

			<section id="how" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"파이프라인"}</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">{"PR URL에서 전체 분석까지"}</h2>
					</FadeIn>
					<div className="grid sm:grid-cols-5 gap-4">
						{STEPS.map((s, i) => {
							const Icon = s.icon;
							return (
								<FadeIn key={i} delay={i * 100}>
									<div className="relative bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 group hover:border-zinc-700 transition-colors">
										<div className="flex items-center gap-2 mb-3">
											<div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center font-mono text-[11px] text-zinc-500 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">{i + 1}</div>
											<Icon className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
										</div>
										<h3 className="text-[14px] font-semibold mb-1.5">{s.title}</h3>
										<p className="text-[12px] text-zinc-500 leading-relaxed">{s.desc}</p>
										{i < STEPS.length - 1 && (
											<ChevronRight className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700" />
										)}
									</div>
								</FadeIn>
							);
						})}
					</div>
				</div>
			</section>

			<section id="tools" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto grid lg:grid-cols-2 gap-12 items-start">
					<div>
						<FadeIn>
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"채팅 도구"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"PR에 접근 가능한 AI"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"채팅 어시스턴트는 diff 조회, 코멘트 작성, 웹 검색, 리뷰 제출 도구를 보유하고 있습니다 — 모두 대화에서 수행됩니다."}
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								{"\"auth.ts의 42번 라인에 에러 처리 추가를 제안하는 코멘트를 남겨줘\"라고 말하면 AI가 GitHub에 작성합니다."}
							</p>
						</FadeIn>
					</div>
					<FadeIn delay={150}>
						<div className="space-y-2">
							{TOOLS.map((t) => {
								const Icon = t.icon;
								return (
									<div key={t.name} className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-700 transition-colors">
										<Icon className="w-4 h-4 text-zinc-600 shrink-0" />
										<span className="font-mono text-[12px] text-blue-400 shrink-0">{t.name}</span>
										<span className="text-[12px] text-zinc-500 ml-auto">{t.desc}</span>
									</div>
								);
							})}
						</div>
					</FadeIn>
				</div>
			</section>

			<section className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="text-center mb-12">
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"설치"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{"세 가지 시작 방법"}</h2>
						</div>
					</FadeIn>
					<div className="grid sm:grid-cols-3 gap-4">
						{[
							{ title: "바로 실행", cmd: "bunx newpr --web", desc: "설치 없이 실행" },
							{ title: "전역 설치", cmd: "bun add -g newpr", desc: "어디서든 사용 가능" },
							{ title: "npm으로", cmd: "npx newpr --web", desc: "npm을 선호한다면" },
						].map((m, i) => (
							<FadeIn key={i} delay={i * 100}>
								<div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
									<h3 className="text-[14px] font-semibold mb-3">{m.title}</h3>
									<div className="bg-zinc-950 rounded-lg px-4 py-2.5 flex items-center gap-2 mb-3">
										<code className="flex-1 font-mono text-[12px] text-zinc-400"><span className="text-emerald-400">$</span> {m.cmd}</code>
										<CopyButton text={m.cmd} />
									</div>
									<p className="text-[12px] text-zinc-500">{m.desc}</p>
								</div>
							</FadeIn>
						))}
					</div>
				</div>
			</section>

			<section className="py-20 pb-28 text-center px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-6" />
						<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">{"더 스마트한 리뷰와 스태킹을 시작하세요"}</h2>
						<p className="text-[15px] text-zinc-400 mb-8 max-w-[480px] mx-auto">{"명령어 하나로 PR을 이해하고 리뷰 가능한 스택으로 분할합니다. 별도 설정 없이."}</p>
						<div className="flex items-center justify-center gap-3 flex-wrap">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								{"시작하기"} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center hover:text-white hover:border-zinc-600 transition-colors">
								npm에서 보기
							</a>
						</div>
					</FadeIn>
				</div>
			</section>

			<footer className="border-t border-zinc-800/50 py-8 px-6">
				<div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-zinc-600">
					<span>MIT License &middot; Bun + React로 제작</span>
					<div className="flex gap-5">
						<a href="https://www.sionic.ai" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">Sponsored by Sionic AI</a>
						<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">GitHub</a>
						<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">npm</a>
						<a href="https://github.com/jiwonMe" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">@jiwonMe</a>
					</div>
				</div>
			</footer>
		</>
	);
}
