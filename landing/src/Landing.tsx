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
		{ text: "  newpr v0.5", color: "text-white", delay: 2000 },
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

function AnchorDemo() {
	const [active, setActive] = useState<number | null>(null);
	const items = [
		{ type: "group", label: "Auth Flow", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
		{ type: "file", label: "session.ts", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
		{ type: "line", label: "validates JWT tokens and checks expiration", color: "" },
	];
	return (
		<div className="space-y-4">
			<p className="text-[13px] text-zinc-400 leading-relaxed">
				The{" "}
				<button onClick={() => setActive(0)} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border transition-all ${active === 0 ? "bg-blue-500 text-white border-blue-500" : items[0]!.color}`}>
					{items[0]!.label}
				</button>{" "}
				group introduces session management. The key change is in{" "}
				<button onClick={() => setActive(1)} className={`inline px-1.5 py-0.5 rounded-md text-[11px] font-mono border transition-all ${active === 1 ? "bg-blue-500 text-white border-blue-500" : items[1]!.color}`}>
					{items[1]!.label}
				</button>{" "}
				where the new function{" "}
				<button onClick={() => setActive(2)} className={`inline underline transition-all cursor-pointer ${active === 2 ? "decoration-blue-500 decoration-2 bg-blue-500/10 rounded" : "decoration-white/30 decoration-1"} underline-offset-[3px]`}>
					{items[2]!.label}
				</button>
				.
			</p>
			<div className={`text-[11px] text-zinc-500 transition-all duration-300 ${active !== null ? "opacity-100" : "opacity-0"}`}>
				{active === 0 && "→ Opens group detail in sidebar"}
				{active === 1 && "→ Opens file diff in sidebar"}
				{active === 2 && "→ Scrolls diff to exact lines L24-L35"}
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
						<span className="text-[9px] text-zinc-600 ml-1.5">v0.5</span>
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
							{["Story", "Discussion", "Groups", "Files", "Slides"].map((tab, i) => (
								<button key={tab} className={`px-3 pb-2 text-[11px] border-b-2 transition-colors ${i === 0 ? "text-white border-white font-medium" : "text-zinc-600 border-transparent"}`}>{tab}</button>
							))}
						</div>
					</div>

					<div className="flex-1 px-4 py-4 overflow-hidden">
						<div className="space-y-3">
							<div className="text-[9px] text-zinc-600 uppercase tracking-widest">Walkthrough</div>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								The <span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">Loop Node Schema</span> group defines the core data structures.{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">The new loopProperties schema</span> specifies iteration type, repeat count, and max iterations, with{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">the SubworkflowBody schema</span> defining the internal node and link arrays.
							</p>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								Building on this, the <span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">State Management</span> group implements{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">cross-boundary node movement handlers</span> that manage{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">loop entry/exit validation</span> and{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">subworkflow state synchronization</span>.
							</p>

							<div className="border-t border-zinc-800 pt-3 mt-4">
								<div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">Chat</div>
								<p className="text-[10px] text-zinc-500">Ask anything about this PR</p>
							</div>
						</div>
					</div>

					<div className="px-4 pb-3 pt-1 border-t border-zinc-800">
						<div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
							<span className="text-[11px] text-zinc-600 flex-1">Ask about this PR...</span>
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

const FEATURES = [
	{ icon: BookOpen, title: "Narrative Walkthrough", desc: "Prose-first story with clickable code references. Every sentence links to exact lines in the diff." },
	{ icon: Link, title: "Line-Level Anchors", desc: "Three anchor types — group chips, file chips, and inline underlined links that scroll to exact line ranges." },
	{ icon: MessageSquare, title: "Interactive Chat", desc: "Ask follow-up questions with agentic tool execution. Post review comments directly from chat." },
	{ icon: Bot, title: "Agentic Exploration", desc: "Claude, OpenCode, or Codex explores the full codebase for project structure, dependencies, and issues." },
	{ icon: Presentation, title: "Slide Deck", desc: "Auto-generated presentations. Opus designs the style, Gemini renders each slide sequentially." },
	{ icon: CheckCircle, title: "Review Actions", desc: "Approve, request changes, or comment directly. Post inline review comments on specific lines." },
	{ icon: Palette, title: "Comic Strip", desc: "4-panel comic that humorously visualizes the PR changes. Powered by Gemini image generation." },
	{ icon: Stethoscope, title: "React Doctor", desc: "Auto-detects React projects and runs code quality scoring for security, performance, and architecture." },
	{ icon: Plug, title: "Plugin System", desc: "Extensible architecture. Enable or disable generators like slides and comics from settings." },
];

const STEPS = [
	{ icon: GitPullRequest, title: "Paste a PR URL", desc: "Any GitHub PR link. Fetches metadata, commits, diff, and discussion from the API." },
	{ icon: Search, title: "Clone & Explore", desc: "An AI agent clones the repo and explores the full codebase — structure, imports, tests." },
	{ icon: Layers, title: "Analyze & Group", desc: "Files are summarized in parallel, then clustered into logical groups with risk assessment." },
	{ icon: Code, title: "Generate Narrative", desc: "A prose walkthrough is written with dense line-level code references pointing to exact diffs." },
	{ icon: MessageSquare, title: "Review & Chat", desc: "Browse the analysis, click anchors to navigate code, chat for deeper analysis, submit reviews." },
];

const TOOLS = [
	{ name: "get_file_diff", desc: "Fetch unified diff for a file", icon: Code },
	{ name: "create_review_comment", desc: "Post inline comment on specific lines", icon: MessageSquare },
	{ name: "submit_review", desc: "Approve, request changes, or comment", icon: CheckCircle },
	{ name: "web_search", desc: "Search the web via agent delegation", icon: Globe },
	{ name: "run_react_doctor", desc: "React code quality analysis", icon: Stethoscope },
];

const STATS = [
	{ value: "1000+", label: "Lines handled" },
	{ value: "10+", label: "Chat tools" },
	{ value: "3", label: "Anchor types" },
	{ value: "<2min", label: "Full analysis" },
];

export function Landing() {
	return (
		<>
			<nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
				<div className="max-w-[1080px] mx-auto px-6 h-14 flex items-center justify-between">
					<a href="/" className="font-mono text-sm font-semibold tracking-tight">newpr</a>
					<div className="flex items-center gap-5">
						<a href="#features" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">Features</a>
						<a href="#how" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">How it works</a>
						<a href="#tools" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">Tools</a>
						<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">GitHub</a>
						<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-8 px-3.5 bg-white text-black text-[13px] font-medium rounded-lg flex items-center hover:bg-zinc-200 transition-colors">Install</a>
					</div>
				</div>
			</nav>

			<section className="pt-32 sm:pt-40 pb-16 text-center px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[12px] text-blue-400 font-medium mb-6">
							<span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
							Open Source &middot; MIT License
						</div>
					</FadeIn>
					<FadeIn delay={100}>
						<h1 className="text-4xl sm:text-5xl lg:text-[64px] font-bold tracking-[-0.04em] leading-[1.08] mb-6">
							<span className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">Turn large PRs into</span>
							<br />
							<span className="bg-gradient-to-b from-blue-400 to-blue-600 bg-clip-text text-transparent">readable stories</span>
						</h1>
					</FadeIn>
					<FadeIn delay={200}>
						<p className="text-base sm:text-lg text-zinc-400 max-w-[520px] mx-auto mb-10 leading-relaxed">
							AI-powered review tool with clickable code references, interactive chat, slide generation, and one-click review actions.
						</p>
					</FadeIn>
					<FadeIn delay={300}>
						<div className="flex items-center justify-center gap-3 flex-wrap mb-6">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="#demo" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center gap-2 hover:text-white hover:border-zinc-600 transition-colors">
								<Play className="w-3.5 h-3.5" /> See how it works
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

			<section id="demo" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
					<div>
						<FadeIn>
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Quick Start</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">Up and running in seconds</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								One command launches the web UI. newpr detects your installed tools, connects to GitHub via the CLI, and opens your browser automatically.
							</p>
							<div className="space-y-3 text-[13px]">
								{[
									"Auto-detects Claude, OpenCode, or Codex",
									"Uses gh CLI for GitHub authentication",
									"Opens browser automatically on launch",
									"Works with any public or private repo",
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
							<AnchorDemo />
						</div>
					</FadeIn>
					<div className="order-1 lg:order-2">
						<FadeIn>
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Navigation</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">Every claim links to its source</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								Like a Wikipedia article, the narrative is densely linked. Group anchors open details, file anchors open diffs, and line anchors scroll to exact code positions.
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								Target density: 3–6 line anchors per paragraph. Every function, type, config change, and import gets its own clickable reference.
							</p>
						</FadeIn>
					</div>
				</div>
			</section>

			<section id="features" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Features</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">Everything you need to review large PRs</h2>
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
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Pipeline</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">From PR URL to full analysis</h2>
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Chat Tools</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">AI with access to your PR</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								The chat assistant has tools to fetch diffs, post comments, search the web, and submit reviews — all from the conversation.
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								Say "leave a comment on line 42 of auth.ts suggesting to add error handling" and the AI will post it to GitHub.
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Installation</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Three ways to get started</h2>
						</div>
					</FadeIn>
					<div className="grid sm:grid-cols-3 gap-4">
						{[
							{ title: "Quick run", cmd: "bunx newpr --web", desc: "No installation needed" },
							{ title: "Global install", cmd: "bun add -g newpr", desc: "Available everywhere" },
							{ title: "With npm", cmd: "npx newpr --web", desc: "If you prefer npm" },
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
						<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Start reviewing smarter</h2>
						<p className="text-[15px] text-zinc-400 mb-8 max-w-[440px] mx-auto">One command to understand any PR. No configuration needed with Claude Code.</p>
						<div className="flex items-center justify-center gap-3 flex-wrap">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center hover:text-white hover:border-zinc-600 transition-colors">
								View on npm
							</a>
						</div>
					</FadeIn>
				</div>
			</section>

			<section className="py-10 px-6">
				<div className="max-w-[480px] mx-auto">
					<a
						href="https://www.sionic.ai"
						target="_blank"
						rel="noopener noreferrer"
						className="group relative flex items-center gap-3.5 rounded-xl overflow-hidden px-5 py-4 transition-all hover:shadow-lg hover:shadow-blue-500/10"
						style={{ background: "linear-gradient(135deg, #071121 0%, #0d1b33 50%, #1a2d54 100%)" }}
					>
						<img
							src="https://www.sionic.ai/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fmain-intro-bg.1455295d.png&w=1920&q=75"
							alt=""
							className="absolute inset-0 w-full h-full object-cover object-bottom opacity-25 group-hover:opacity-40 transition-opacity pointer-events-none"
						/>
						<div className="absolute inset-0 bg-gradient-to-r from-[#071121]/70 via-transparent to-transparent pointer-events-none" />
						<div className="relative flex items-center gap-3 flex-1 min-w-0">
							<img src="https://www.sionic.ai/favicon.ico" alt="Sionic AI" className="h-5 w-5 shrink-0" />
							<div className="flex flex-col min-w-0">
								<span className="text-[12px] font-semibold text-white/80">Sionic AI</span>
								<span className="text-[10px] text-white/35">The Power of AI for Every Business</span>
							</div>
						</div>
						<div className="relative flex items-center gap-1.5 shrink-0">
							<span className="text-[9px] text-white/20 uppercase tracking-widest">Sponsor</span>
						</div>
					</a>
				</div>
			</section>

			<footer className="border-t border-zinc-800/50 py-8 px-6">
				<div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-zinc-600">
					<span>MIT License &middot; Built with Bun + React</span>
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
