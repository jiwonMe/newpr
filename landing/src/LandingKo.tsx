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
		{ text: "  \u2713 gh 2.62.0 \u00b7 jiwonMe", color: "text-emerald-400", delay: 1200 },
		{ text: "  \u2713 claude 1.0.3", color: "text-emerald-400", delay: 1400 },
		{ text: "  \u2713 OpenRouter API key", color: "text-emerald-400", delay: 1600 },
		{ text: "", color: "", delay: 1800 },
		{ text: "  newpr v1.0", color: "text-white", delay: 2000 },
		{ text: "  \u2192 Local    http://localhost:3456", color: "text-blue-400", delay: 2200 },
		{ text: "  \u2192 Model    claude-sonnet-4.6", color: "text-zinc-500", delay: 2400 },
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
		{ type: "line", label: "JWT \ud1a0\ud070\uc744 \uac80\uc99d\ud558\uace0 \ub9cc\ub8cc\ub97c \ud655\uc778", color: "" },
	];
	return (
		<div className="space-y-4">
			<p className="text-[13px] text-zinc-400 leading-relaxed">
				<button onClick={() => setActive(0)} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border transition-all ${active === 0 ? "bg-blue-500 text-white border-blue-500" : items[0]!.color}`}>
					{items[0]!.label}
				</button>{" "}
				\uadf8\ub8f9\uc740 \uc138\uc158 \uad00\ub9ac\ub97c \ub3c4\uc785\ud569\ub2c8\ub2e4. \ud575\uc2ec \ubcc0\uacbd\uc740{" "}
				<button onClick={() => setActive(1)} className={`inline px-1.5 py-0.5 rounded-md text-[11px] font-mono border transition-all ${active === 1 ? "bg-blue-500 text-white border-blue-500" : items[1]!.color}`}>
					{items[1]!.label}
				</button>{" "}
				\uc5d0\uc11c \uc0c8\ub85c\uc6b4 \ud568\uc218\uac00{" "}
				<button onClick={() => setActive(2)} className={`inline underline transition-all cursor-pointer ${active === 2 ? "decoration-blue-500 decoration-2 bg-blue-500/10 rounded" : "decoration-white/30 decoration-1"} underline-offset-[3px]`}>
					{items[2]!.label}
				</button>
				\ud558\ub294 \ubd80\ubd84\uc785\ub2c8\ub2e4.
			</p>
			<div className={`text-[11px] text-zinc-500 transition-all duration-300 ${active !== null ? "opacity-100" : "opacity-0"}`}>
				{active === 0 && "\u2192 \uc0ac\uc774\ub4dc\ubc14\uc5d0\uc11c \uadf8\ub8f9 \uc0c1\uc138 \uc5f4\uae30"}
				{active === 1 && "\u2192 \uc0ac\uc774\ub4dc\ubc14\uc5d0\uc11c \ud30c\uc77c diff \uc5f4\uae30"}
				{active === 2 && "\u2192 diff\ub97c L24-L35 \uc704\uce58\ub85c \uc2a4\ud06c\ub864"}
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
							<span>main \u2190 feat/loop-node</span>
							<span className="text-green-500">+2,847</span>
							<span className="text-red-500">-342</span>
							<span>48 files</span>
						</div>
						<div className="flex gap-0 border-b border-zinc-800 -mb-2">
							{["\uc2a4\ud1a0\ub9ac", "\ub514\uc2a4\ucee4\uc158", "\uadf8\ub8f9", "\ud30c\uc77c", "\uc2ac\ub77c\uc774\ub4dc"].map((tab, i) => (
								<button key={tab} className={`px-3 pb-2 text-[11px] border-b-2 transition-colors ${i === 0 ? "text-white border-white font-medium" : "text-zinc-600 border-transparent"}`}>{tab}</button>
							))}
						</div>
					</div>

					<div className="flex-1 px-4 py-4 overflow-hidden">
						<div className="space-y-3">
							<div className="text-[9px] text-zinc-600 uppercase tracking-widest">\uc6cc\ud06c\uc2a4\ub8e8</div>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								<span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">Loop Node Schema</span> \uadf8\ub8f9\uc740 \ud575\uc2ec \ub370\uc774\ud130 \uad6c\uc870\ub97c \uc815\uc758\ud569\ub2c8\ub2e4.{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">\uc0c8\ub85c\uc6b4 loopProperties \uc2a4\ud0a4\ub9c8</span>\ub294 \ubc18\ubcf5 \uc720\ud615, \ud69f\uc218, \ucd5c\ub300 \ubc18\ubcf5\uc744 \uc9c0\uc815\ud558\uace0,{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">SubworkflowBody \uc2a4\ud0a4\ub9c8</span>\ub294 \ub0b4\ubd80 \ub178\ub4dc\uc640 \ub9c1\ud06c \ubc30\uc5f4\uc744 \uc815\uc758\ud569\ub2c8\ub2e4.
							</p>
							<p className="text-[11px] text-zinc-400 leading-relaxed">
								\uc774\ub97c \uae30\ubc18\uc73c\ub85c <span className="inline-flex items-center px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-medium">State Management</span> \uadf8\ub8f9\uc740{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">\uacbd\uacc4 \uac04 \ub178\ub4dc \uc774\ub3d9 \ud578\ub4e4\ub7ec</span>\ub97c \uad6c\ud604\ud558\uc5ec{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">\ub8e8\ud504 \uc9c4\uc785/\ud0c8\ucd9c \uac80\uc99d</span>\uacfc{" "}
								<span className="underline underline-offset-2 decoration-zinc-600 text-zinc-300">\uc11c\ube0c\uc6cc\ud06c\ud50c\ub85c\uc6b0 \uc0c1\ud0dc \ub3d9\uae30\ud654</span>\ub97c \uad00\ub9ac\ud569\ub2c8\ub2e4.
							</p>

							<div className="border-t border-zinc-800 pt-3 mt-4">
								<div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">\ub300\ud654</div>
								<p className="text-[10px] text-zinc-500">\uc774 PR\uc5d0 \ub300\ud574 \ubb34\uc5c7\uc774\ub4e0 \ubb3c\uc5b4\ubcf4\uc138\uc694</p>
							</div>
						</div>
					</div>

					<div className="px-4 pb-3 pt-1 border-t border-zinc-800">
						<div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
							<span className="text-[11px] text-zinc-600 flex-1">PR\uc5d0 \ub300\ud574 \uc9c8\ubb38\ud558\uae30...</span>
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
		{ order: 1, type: "feat", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", title: "loop node \uc2a4\ud0a4\ub9c8 \ucd94\uac00", plus: 247, minus: 12 },
		{ order: 2, type: "feat", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", title: "\uc0c1\ud0dc \uad00\ub9ac \uad6c\ud604", plus: 189, minus: 34 },
		{ order: 3, type: "refactor", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", title: "\uce94\ubc84\uc2a4 \ub80c\ub354\ub9c1 \uac1c\uc120", plus: 156, minus: 87 },
		{ order: 4, type: "test", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", title: "\ud1b5\ud569 \ud14c\uc2a4\ud2b8 \ucd94\uac00", plus: 312, minus: 0 },
	];
	return (
		<div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl shadow-black/50 p-6 sm:p-8">
			<div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
				<div className="flex-shrink-0 w-full lg:w-auto">
					<div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 w-full lg:w-[200px]">
						<div className="flex items-center gap-2 mb-3">
							<GitPullRequest className="w-4 h-4 text-red-400" />
							<span className="text-[11px] text-zinc-400 font-medium">\uc6d0\ubcf8 PR</span>
						</div>
						<p className="text-[13px] font-semibold text-zinc-200 mb-3 leading-snug">Add loop node support for workflow editor</p>
						<div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-3">
							<span className="text-green-500">+904</span>
							<span className="text-red-500">-133</span>
						</div>
						<div className="text-[10px] text-zinc-600">48\uac1c \ud30c\uc77c \ubcc0\uacbd</div>
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
						<span className="text-[10px] text-zinc-600">\uac01 PR\uc740 \ub3c5\ub9bd\uc801\uc73c\ub85c \ub9ac\ubdf0 \uac00\ub2a5</span>
						<div className="h-px flex-1 bg-gradient-to-l from-zinc-800 to-transparent" />
					</div>
				</div>
			</div>
		</div>
	);
}

const FEATURES = [
	{ icon: Layers, title: "PR \uc2a4\ud0dc\ud0b9", desc: "\uac70\ub300\ud55c PR\uc744 \uc791\uace0 \ub9ac\ubdf0\ud558\uae30 \uc26c\uc6b4 \uc2a4\ud0dd PR\ub85c \ubd84\ud560\ud569\ub2c8\ub2e4. AI\uac00 \ud30c\uc77c\uc744 \uad00\uc2ec\uc0ac\ubcc4\ub85c \uadf8\ub8f9\ud654\ud558\uace0, \ube0c\ub79c\uce58 \uacc4\uce35\uc744 \uc0dd\uc131\ud558\uba70, \uc5f0\uacb0\ub41c \ub4dc\ub798\ud504\ud2b8 PR\ub85c \ubc1c\ud589\ud569\ub2c8\ub2e4." },
	{ icon: Play, title: "\ubc31\uadf8\ub77c\uc6b4\ub4dc \ucc98\ub9ac", desc: "\uc2a4\ud0dd \ud30c\uc774\ud504\ub77c\uc778\uc774 \uc11c\ubc84\uc5d0\uc11c \uc2e4\ud589\ub418\uba70 SSE\ub85c \uc9c4\ud589 \uc0c1\ud669\uc744 \uc2a4\ud2b8\ub9ac\ubc0d\ud569\ub2c8\ub2e4. \uc5b4\ub290 \uae30\uae30\uc5d0\uc11c\ub4e0 \uc774\uc5b4\uc11c \uc791\uc5c5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4." },
	{ icon: BookOpen, title: "\ub0b4\ub7ec\ud2f0\ube0c \uc6cc\ud06c\uc2a4\ub8e8", desc: "\ud074\ub9ad \uac00\ub2a5\ud55c \ucf54\ub4dc \ucc38\uc870\uac00 \ud3ec\ud568\ub41c \uc0b0\ubb38 \ud615\uc2dd\uc758 \uc2a4\ud1a0\ub9ac. \ubaa8\ub4e0 \ubb38\uc7a5\uc774 diff\uc758 \uc815\ud655\ud55c \ub77c\uc778\uc73c\ub85c \uc5f0\uacb0\ub429\ub2c8\ub2e4." },
	{ icon: Link, title: "\ub77c\uc778 \ub808\ubca8 \uc575\ucee4", desc: "\uadf8\ub8f9 \uce69, \ud30c\uc77c \uce69, \uc778\ub77c\uc778 \ubc11\uc904 \ub9c1\ud06c \uc138 \uac00\uc9c0 \uc575\ucee4 \ud0c0\uc785\uc73c\ub85c \uc815\ud655\ud55c \ub77c\uc778 \ubc94\uc704\ub85c \uc2a4\ud06c\ub864\ud569\ub2c8\ub2e4." },
	{ icon: MessageSquare, title: "\ub300\ud654\ud615 \ucc44\ud305", desc: "\uc5d0\uc774\uc804\ud2b8 \ub3c4\uad6c \uc2e4\ud589\uc73c\ub85c \ud6c4\uc18d \uc9c8\ubb38\uc744 \ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4. \ucc44\ud305\uc5d0\uc11c \ub9ac\ubdf0 \ucf54\uba58\ud2b8\ub97c \uc9c1\uc811 \uc791\uc131\ud569\ub2c8\ub2e4." },
	{ icon: Bot, title: "\uc5d0\uc774\uc804\ud2b8 \ud0d0\uc0c9", desc: "Claude, OpenCode \ub610\ub294 Codex\uac00 \ud504\ub85c\uc81d\ud2b8 \uad6c\uc870, \uc758\uc874\uc131, \uc774\uc288\ub97c \ud30c\uc545\ud558\uae30 \uc704\ud574 \uc804\uccb4 \ucf54\ub4dc\ubca0\uc774\uc2a4\ub97c \ud0d0\uc0c9\ud569\ub2c8\ub2e4." },
	{ icon: Presentation, title: "\uc2ac\ub77c\uc774\ub4dc \ub371", desc: "\uc790\ub3d9 \uc0dd\uc131\ub418\ub294 \ud504\ub808\uc820\ud14c\uc774\uc158. Opus\uac00 \uc2a4\ud0c0\uc77c\uc744 \ub514\uc790\uc778\ud558\uace0, Gemini\uac00 \uac01 \uc2ac\ub77c\uc774\ub4dc\ub97c \uc21c\ucc28\uc801\uc73c\ub85c \ub80c\ub354\ub9c1\ud569\ub2c8\ub2e4." },
	{ icon: CheckCircle, title: "\ub9ac\ubdf0 \uc561\uc158", desc: "\uc2b9\uc778, \ubcc0\uacbd \uc694\uccad, \ucf54\uba58\ud2b8\ub97c \uc9c1\uc811 \uc218\ud589\ud569\ub2c8\ub2e4. \ud2b9\uc815 \ub77c\uc778\uc5d0 \uc778\ub77c\uc778 \ub9ac\ubdf0 \ucf54\uba58\ud2b8\ub97c \uc791\uc131\ud569\ub2c8\ub2e4." },
	{ icon: Palette, title: "\ucf54\ubbf9 \uc2a4\ud2b8\ub9bd", desc: "PR \ubcc0\uacbd \uc0ac\ud56d\uc744 \uc720\uba38\ub7ec\uc2a4\ud558\uac8c \uc2dc\uac01\ud654\ud558\ub294 4\ucef7 \ub9cc\ud654. Gemini \uc774\ubbf8\uc9c0 \uc0dd\uc131\uc73c\ub85c \uad6c\ub3d9\ub429\ub2c8\ub2e4." },
	{ icon: Stethoscope, title: "React Doctor", desc: "React \ud504\ub85c\uc81d\ud2b8\ub97c \uc790\ub3d9 \uac10\uc9c0\ud558\uace0 \ubcf4\uc548, \uc131\ub2a5, \uc544\ud0a4\ud14d\ucc98 \ud488\uc9c8 \uc810\uc218\ub97c \uc0b0\ucd9c\ud569\ub2c8\ub2e4." },
	{ icon: Plug, title: "\ud50c\ub7ec\uadf8\uc778 \uc2dc\uc2a4\ud15c", desc: "\ud655\uc7a5 \uac00\ub2a5\ud55c \uc544\ud0a4\ud14d\ucc98. \uc124\uc815\uc5d0\uc11c \uc2ac\ub77c\uc774\ub4dc\ub098 \ucf54\ubbf9 \uac19\uc740 \uc0dd\uc131\uae30\ub97c \ud65c\uc131\ud654/\ube44\ud65c\uc131\ud654\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4." },
];

const STEPS = [
	{ icon: GitPullRequest, title: "PR URL \ubd99\uc5ec\ub123\uae30", desc: "\uc544\ubb34 GitHub PR \ub9c1\ud06c. API\uc5d0\uc11c \uba54\ud0c0\ub370\uc774\ud130, \ucee4\ubc0b, diff, \ub514\uc2a4\ucee4\uc158\uc744 \uac00\uc838\uc635\ub2c8\ub2e4." },
	{ icon: Search, title: "\ud074\ub860 & \ud0d0\uc0c9", desc: "AI \uc5d0\uc774\uc804\ud2b8\uac00 \ub808\ud3ec\ub97c \ud074\ub860\ud558\uace0 \uc804\uccb4 \ucf54\ub4dc\ubca0\uc774\uc2a4\ub97c \ud0d0\uc0c9\ud569\ub2c8\ub2e4 \u2014 \uad6c\uc870, \uc784\ud3ec\ud2b8, \ud14c\uc2a4\ud2b8." },
	{ icon: Layers, title: "\ubd84\uc11d & \uadf8\ub8f9\ud654", desc: "\ud30c\uc77c\uc744 \ubcd1\ub82c\ub85c \uc694\uc57d\ud55c \ud6c4 \uc704\ud5d8 \ud3c9\uac00\uc640 \ud568\uaed8 \ub17c\ub9ac\uc801 \uadf8\ub8f9\uc73c\ub85c \ud074\ub7ec\uc2a4\ud130\ub9c1\ud569\ub2c8\ub2e4." },
	{ icon: Code, title: "\ub0b4\ub7ec\ud2f0\ube0c \uc0dd\uc131", desc: "\uc815\ud655\ud55c diff\ub97c \uac00\ub9ac\ud0a4\ub294 \ub77c\uc778 \ub808\ubca8 \ucf54\ub4dc \ucc38\uc870\uac00 \ud3ec\ud568\ub41c \uc0b0\ubb38 \uc6cc\ud06c\uc2a4\ub8e8\ub97c \uc791\uc131\ud569\ub2c8\ub2e4." },
	{ icon: MessageSquare, title: "\ub9ac\ubdf0 & \ucc44\ud305", desc: "\ubd84\uc11d\uc744 \ud0d0\uc0c9\ud558\uace0, \uc575\ucee4\ub97c \ud074\ub9ad\ud558\uc5ec \ucf54\ub4dc\ub97c \ud0d0\uc0c9\ud558\uace0, \ucc44\ud305\uc73c\ub85c \uc2ec\uce35 \ubd84\uc11d\ud558\uace0, \ub9ac\ubdf0\ub97c \uc81c\ucd9c\ud569\ub2c8\ub2e4." },
];

const TOOLS = [
	{ name: "get_file_diff", desc: "\ud30c\uc77c\uc758 unified diff \uc870\ud68c", icon: Code },
	{ name: "create_review_comment", desc: "\ud2b9\uc815 \ub77c\uc778\uc5d0 \uc778\ub77c\uc778 \ucf54\uba58\ud2b8 \uc791\uc131", icon: MessageSquare },
	{ name: "submit_review", desc: "\uc2b9\uc778, \ubcc0\uacbd \uc694\uccad \ub610\ub294 \ucf54\uba58\ud2b8", icon: CheckCircle },
	{ name: "web_search", desc: "\uc5d0\uc774\uc804\ud2b8 \uc704\uc784\uc73c\ub85c \uc6f9 \uac80\uc0c9", icon: Globe },
	{ name: "run_react_doctor", desc: "React \ucf54\ub4dc \ud488\uc9c8 \ubd84\uc11d", icon: Stethoscope },
];

const STATS = [
	{ value: "10k+", label: "PR\ub2f9 \ucc98\ub9ac \ub77c\uc778" },
	{ value: "10+", label: "\ucc44\ud305 & \ub9ac\ubdf0 \ub3c4\uad6c" },
	{ value: "<2\ubd84", label: "\uc804\uccb4 \ubd84\uc11d \uc18c\uc694" },
	{ value: "1 to N", label: "\ud558\ub098\uc758 PR\uc5d0\uc11c" },
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
						<a href="#stacking" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"\uc2a4\ud0dc\ud0b9"}</a>
						<a href="#features" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"\uae30\ub2a5"}</a>
						<a href="#how" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"\uc791\ub3d9 \ubc29\uc2dd"}</a>
						<a href="#tools" className="hidden sm:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">{"\ub3c4\uad6c"}</a>
						<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">GitHub</a>
						<a href="/newpr/" className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors">EN</a>
						<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-8 px-3.5 bg-white text-black text-[13px] font-medium rounded-lg flex items-center hover:bg-zinc-200 transition-colors">{"\uc124\uce58"}</a>
					</div>
				</div>
			</nav>

			<section className="pt-40 sm:pt-48 pb-16 text-center px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[12px] text-blue-400 font-medium mb-6">
							<span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
							{"\uc624\ud508\uc18c\uc2a4 \u00b7 MIT \ub77c\uc774\uc120\uc2a4"}
						</div>
					</FadeIn>
					<FadeIn delay={100}>
						<h1 className="text-4xl sm:text-5xl lg:text-[64px] font-bold tracking-[-0.04em] leading-[1.08] mb-6">
							<span className="bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent">{"\uac70\ub300\ud55c PR\uc744 \ub9ac\ubdf0\ud558\uace0"}</span>
							<br />
							<span className="bg-gradient-to-b from-blue-400 to-blue-600 bg-clip-text text-transparent">{"\uc2a4\ud0dd\uc73c\ub85c \ubd84\ud560\ud558\uc138\uc694"}</span>
						</h1>
					</FadeIn>
					<FadeIn delay={200}>
						<p className="text-base sm:text-lg text-zinc-400 max-w-[560px] mx-auto mb-10 leading-relaxed">
							{"\uac70\ub300\ud55c PR\uc744 \ub0b4\ub7ec\ud2f0\ube0c \uc6cc\ud06c\uc2a4\ub8e8\ub85c \ubcc0\ud658\ud558\uace0, \uc791\uace0 \ub9ac\ubdf0\ud558\uae30 \uc26c\uc6b4 \uc2a4\ud0dd PR\ub85c \ubd84\ud560\ud569\ub2c8\ub2e4 \u2014 \uba85\ub839\uc5b4 \ud558\ub098\ub85c."}
						</p>
					</FadeIn>
					<FadeIn delay={300}>
						<div className="flex items-center justify-center gap-3 flex-wrap mb-6">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								{"\uc2dc\uc791\ud558\uae30"} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="#demo" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center gap-2 hover:text-white hover:border-zinc-600 transition-colors">
								<Play className="w-3.5 h-3.5" /> {"\uc791\ub3d9 \ubc29\uc2dd \ubcf4\uae30"}
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
								v1.0 {"\uc2e0\uae30\ub2a5"}
							</div>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"\ud558\ub098\uc758 PR\uc744 \ub9ac\ubdf0 \uac00\ub2a5\ud55c \uc2a4\ud0dd\uc73c\ub85c \ubd84\ud560"}</h2>
							<p className="text-[15px] text-zinc-400 max-w-[560px] mx-auto leading-relaxed">
								{"AI\uac00 \ud30c\uc77c \uc758\uc874\uc131\uc744 \ubd84\uc11d\ud558\uace0, \uad00\uc2ec\uc0ac\ubcc4\ub85c \ubcc0\uacbd\uc0ac\ud56d\uc744 \uadf8\ub8f9\ud654\ud558\uace0, \uc791\uace0 \uc9d1\uc911\ub41c PR \uccb4\uc778\uc744 \uc0dd\uc131\ud569\ub2c8\ub2e4 \u2014 \uac01\uac01 \uc774\uc804 PR \uc704\uc5d0 \uc313\uc785\ub2c8\ub2e4."}
							</p>
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
								{ title: "\uc758\uc874\uc131 \uc778\uc9c0 \uc21c\uc11c", desc: "\uc704\uc0c1 \uc815\ub82c\ub85c \uac01 PR\uc774 \ubd80\ubaa8 PR \uc704\uc5d0 \uae68\ub057\ud558\uac8c \ube4c\ub4dc\ub429\ub2c8\ub2e4. \uc911\uac04\uc5d0 \uae68\uc9c0\ub294 \uc0c1\ud0dc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4." },
								{ title: "Git plumbing\ub9cc \uc0ac\uc6a9", desc: "cherry-pick\uc774\ub098 patch \uc5c6\uc774 \uc21c\uc218 \ud2b8\ub9ac \uc870\uc791\uacfc \uc778\ub371\uc2a4 \uc804\uc6a9 \uc5f0\uc0b0\uc73c\ub85c \uc644\ubcbd\ud55c \uc815\ud655\ub3c4\ub97c \ubcf4\uc7a5\ud569\ub2c8\ub2e4." },
								{ title: "\uc5f0\uacb0\ub41c \ub4dc\ub798\ud504\ud2b8 PR", desc: "GitHub\uc5d0 \uc5f0\uacb0\ub41c \ub4dc\ub798\ud504\ud2b8 PR\ub85c \ubc1c\ud589\ud569\ub2c8\ub2e4. \uac01 PR\uc740 \uc2a4\ud0dd\uc5d0\uc11c \ubd80\ubaa8 PR\uc744 \ucc38\uc870\ud569\ub2c8\ub2e4." },
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\ube60\ub978 \uc2dc\uc791"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"\uba87 \ucd08 \ub9cc\uc5d0 \uc2e4\ud589"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"\uba85\ub839\uc5b4 \ud558\ub098\ub85c \uc6f9 UI\uac00 \uc2e4\ud589\ub429\ub2c8\ub2e4. newpr\uc774 \uc124\uce58\ub41c \ub3c4\uad6c\ub97c \uac10\uc9c0\ud558\uace0, GitHub CLI\ub85c \uc5f0\uacb0\ud558\uace0, \ube0c\ub77c\uc6b0\uc800\ub97c \uc790\ub3d9\uc73c\ub85c \uc5fd\ub2c8\ub2e4."}
							</p>
							<div className="space-y-3 text-[13px]">
								{[
									"Claude, OpenCode, Codex \uc790\ub3d9 \uac10\uc9c0",
									"gh CLI\ub85c GitHub \uc778\uc99d",
									"\uc2e4\ud589 \uc2dc \ube0c\ub77c\uc6b0\uc800 \uc790\ub3d9 \uc5f4\uae30",
									"\ubaa8\ub4e0 \uacf5\uac1c/\ube44\uacf5\uac1c \ub808\ud3ec \uc9c0\uc6d0",
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\ub0b4\ube44\uac8c\uc774\uc158"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"\ubaa8\ub4e0 \uc124\uba85\uc774 \ucd9c\ucc98\uc640 \uc5f0\uacb0\ub429\ub2c8\ub2e4"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"\uc704\ud0a4\ud53c\ub514\uc544 \ubb38\uc11c\ucc98\ub7fc \ub0b4\ub7ec\ud2f0\ube0c\ub294 \uc870\ubc00\ud558\uac8c \ub9c1\ud06c\ub418\uc5b4 \uc788\uc2b5\ub2c8\ub2e4. \uadf8\ub8f9 \uc575\ucee4\ub294 \uc0c1\uc138 \uc815\ubcf4\ub97c, \ud30c\uc77c \uc575\ucee4\ub294 diff\ub97c, \ub77c\uc778 \uc575\ucee4\ub294 \uc815\ud655\ud55c \ucf54\ub4dc \uc704\uce58\ub85c \uc2a4\ud06c\ub864\ud569\ub2c8\ub2e4."}
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								{"\ubaa9\ud45c \ubc00\ub3c4: \ub2e8\ub77d\ub2f9 3\u20136\uac1c \ub77c\uc778 \uc575\ucee4. \ubaa8\ub4e0 \ud568\uc218, \ud0c0\uc785, \uc124\uc815 \ubcc0\uacbd, \uc784\ud3ec\ud2b8\uac00 \uac01\uac01 \ud074\ub9ad \uac00\ub2a5\ud55c \ucc38\uc870\ub97c \uac00\uc9d1\ub2c8\ub2e4."}
							</p>
						</FadeIn>
					</div>
				</div>
			</section>

			<section id="features" className="py-20 px-6">
				<div className="max-w-[1080px] mx-auto">
					<FadeIn>
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\uae30\ub2a5"}</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">{"\uac70\ub300\ud55c PR\uc744 \ub9ac\ubdf0\ud558\uace0 \ubd84\ud560\ud558\ub294 \ub370 \ud544\uc694\ud55c \ubaa8\ub4e0 \uac83"}</h2>
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
						<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\ud30c\uc774\ud504\ub77c\uc778"}</p>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">{"PR URL\uc5d0\uc11c \uc804\uccb4 \ubd84\uc11d\uae4c\uc9c0"}</h2>
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\ucc44\ud305 \ub3c4\uad6c"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">{"PR\uc5d0 \uc811\uadfc \uac00\ub2a5\ud55c AI"}</h2>
							<p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
								{"\ucc44\ud305 \uc5b4\uc2dc\uc2a4\ud134\ud2b8\ub294 diff \uc870\ud68c, \ucf54\uba58\ud2b8 \uc791\uc131, \uc6f9 \uac80\uc0c9, \ub9ac\ubdf0 \uc81c\ucd9c \ub3c4\uad6c\ub97c \ubcf4\uc720\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4 \u2014 \ubaa8\ub450 \ub300\ud654\uc5d0\uc11c \uc218\ud589\ub429\ub2c8\ub2e4."}
							</p>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								{"\"auth.ts\uc758 42\ubc88 \ub77c\uc778\uc5d0 \uc5d0\ub7ec \ucc98\ub9ac \ucd94\uac00\ub97c \uc81c\uc548\ud558\ub294 \ucf54\uba58\ud2b8\ub97c \ub0a8\uaca8\uc918\"\ub77c\uace0 \ub9d0\ud558\uba74 AI\uac00 GitHub\uc5d0 \uc791\uc131\ud569\ub2c8\ub2e4."}
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
							<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">{"\uc124\uce58"}</p>
							<h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{"\uc138 \uac00\uc9c0 \uc2dc\uc791 \ubc29\ubc95"}</h2>
						</div>
					</FadeIn>
					<div className="grid sm:grid-cols-3 gap-4">
						{[
							{ title: "\ubc14\ub85c \uc2e4\ud589", cmd: "bunx newpr --web", desc: "\uc124\uce58 \uc5c6\uc774 \uc2e4\ud589" },
							{ title: "\uc804\uc5ed \uc124\uce58", cmd: "bun add -g newpr", desc: "\uc5b4\ub514\uc11c\ub4e0 \uc0ac\uc6a9 \uac00\ub2a5" },
							{ title: "npm\uc73c\ub85c", cmd: "npx newpr --web", desc: "npm\uc744 \uc120\ud638\ud55c\ub2e4\uba74" },
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
						<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">{"\ub354 \uc2a4\ub9c8\ud2b8\ud55c \ub9ac\ubdf0\uc640 \uc2a4\ud0dc\ud0b9\uc744 \uc2dc\uc791\ud558\uc138\uc694"}</h2>
						<p className="text-[15px] text-zinc-400 mb-8 max-w-[480px] mx-auto">{"\uba85\ub839\uc5b4 \ud558\ub098\ub85c PR\uc744 \uc774\ud574\ud558\uace0 \ub9ac\ubdf0 \uac00\ub2a5\ud55c \uc2a4\ud0dd\uc73c\ub85c \ubd84\ud560\ud569\ub2c8\ub2e4. \ubcc4\ub3c4 \uc124\uc815 \uc5c6\uc774."}</p>
						<div className="flex items-center justify-center gap-3 flex-wrap">
							<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="group h-11 px-6 bg-white text-black text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-zinc-200 transition-colors">
								{"\uc2dc\uc791\ud558\uae30"} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</a>
							<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-xl flex items-center hover:text-white hover:border-zinc-600 transition-colors">
								npm\uc5d0\uc11c \ubcf4\uae30
							</a>
						</div>
					</FadeIn>
				</div>
			</section>

			<footer className="border-t border-zinc-800/50 py-8 px-6">
				<div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-zinc-600">
					<span>MIT License &middot; Bun + React\ub85c \uc81c\uc791</span>
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
