import React, { useState } from "react";

const FEATURES = [
	{ icon: "📖", title: "Narrative Walkthrough", desc: "Prose-first story with clickable code references. Every sentence links to the exact lines in the diff." },
	{ icon: "🔗", title: "Line-Level Anchors", desc: "Three anchor types — group chips, file chips, and inline underlined links that open diffs at exact line ranges." },
	{ icon: "💬", title: "Interactive Chat", desc: "Ask follow-up questions with agentic tool execution. The AI fetches diffs, searches the web, and posts review comments." },
	{ icon: "🤖", title: "Agentic Exploration", desc: "Claude, OpenCode, or Codex explores the full codebase — project structure, dependencies, and potential issues." },
	{ icon: "📊", title: "Slide Deck Generation", desc: "Auto-generates presentation slides. Opus designs the style, Gemini renders each slide in a consistent visual language." },
	{ icon: "✅", title: "Review Actions", desc: "Approve, request changes, or comment directly. Post inline review comments on specific code lines via chat." },
	{ icon: "🎨", title: "Comic Strip", desc: "Generate a 4-panel comic that humorously visualizes the PR. Powered by Gemini image generation." },
	{ icon: "📐", title: "React Doctor", desc: "Auto-detects React projects and runs react-doctor for code quality scoring — security, performance, and architecture." },
	{ icon: "🔌", title: "Plugin System", desc: "Extensible generator architecture. Enable or disable features from settings with toggle switches." },
];

const STEPS = [
	{ title: "Paste a PR URL", desc: "Enter any GitHub PR link. newpr fetches metadata, commits, diff, and discussion." },
	{ title: "Clone & Explore", desc: "The repo is cloned and an AI agent explores the codebase for full context." },
	{ title: "Analyze & Group", desc: "Files are summarized and clustered into logical groups with risk assessment." },
	{ title: "Generate Narrative", desc: "A prose walkthrough is written with dense line-level code references." },
	{ title: "Review & Interact", desc: "Browse the analysis, click anchors, chat with AI, and submit reviews." },
];

const TOOLS = [
	{ name: "get_file_diff", desc: "Fetch unified diff for a specific file" },
	{ name: "list_files", desc: "List all changed files with summaries" },
	{ name: "get_pr_comments", desc: "Fetch PR discussion comments" },
	{ name: "create_review_comment", desc: "Post an inline comment on specific lines" },
	{ name: "submit_review", desc: "Approve, request changes, or comment" },
	{ name: "web_search", desc: "Search the web via agent delegation" },
	{ name: "web_fetch", desc: "Fetch and summarize web page content" },
	{ name: "run_react_doctor", desc: "Run React code quality analysis" },
];

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
			className="shrink-0 border border-zinc-700 text-zinc-500 text-[11px] px-2.5 py-1 rounded-md hover:text-zinc-300 hover:border-zinc-500 transition-colors"
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	);
}

function Nav() {
	return (
		<nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800">
			<div className="max-w-[1080px] mx-auto px-6 h-14 flex items-center justify-between">
				<a href="/" className="font-mono text-sm font-semibold tracking-tight">
					newpr
					<span className="text-zinc-600 font-normal text-[11px] ml-1.5">v0.5</span>
				</a>
				<div className="flex items-center gap-6">
					<a href="#features" className="hidden sm:block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">Features</a>
					<a href="#how" className="hidden sm:block text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">How it works</a>
					<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">GitHub</a>
					<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-8 px-3.5 bg-white text-black text-[13px] font-medium rounded-lg flex items-center gap-1.5 hover:opacity-85 transition-opacity">
						Install
					</a>
				</div>
			</div>
		</nav>
	);
}

function Hero() {
	return (
		<section className="pt-36 pb-20 text-center px-6">
			<div className="max-w-[1080px] mx-auto">
				<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[12px] text-blue-400 font-medium mb-6">
					<span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
					Open Source
				</div>
				<h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
					<span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
						Understand PRs<br />with 1000+ lines
					</span>
				</h1>
				<p className="text-base sm:text-lg text-zinc-400 max-w-[560px] mx-auto mb-10 leading-relaxed">
					AI-powered review tool that turns large pull requests into readable stories with clickable code references, interactive chat, and presentation slides.
				</p>
				<div className="flex items-center justify-center gap-3 flex-wrap">
					<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="h-11 px-6 bg-white text-black text-sm font-semibold rounded-[10px] flex items-center gap-2 hover:opacity-85 transition-opacity">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
						GitHub
					</a>
					<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-[10px] flex items-center hover:text-zinc-100 hover:border-zinc-600 transition-colors">
						npm package
					</a>
				</div>
				<div className="mt-12 max-w-[420px] mx-auto bg-zinc-900/80 border border-zinc-800 rounded-xl px-5 py-3.5 flex items-center gap-3">
					<code className="flex-1 font-mono text-[13px] text-zinc-400">
						<span className="text-emerald-400">$</span> bunx newpr --web
					</code>
					<CopyButton text="bunx newpr --web" />
				</div>
			</div>
		</section>
	);
}

function Features() {
	return (
		<section id="features" className="py-20 px-6">
			<div className="max-w-[1080px] mx-auto">
				<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Features</p>
				<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">Everything you need to review large PRs</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-zinc-800 rounded-2xl overflow-hidden">
					{FEATURES.map((f, i) => (
						<div key={i} className="p-7 bg-[#09090b] border-b border-r border-zinc-800 last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0">
							<div className="w-9 h-9 rounded-[10px] bg-blue-500/10 flex items-center justify-center text-lg mb-4">{f.icon}</div>
							<h3 className="text-[15px] font-semibold mb-2 tracking-tight">{f.title}</h3>
							<p className="text-[13px] text-zinc-400 leading-relaxed">{f.desc}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function HowItWorks() {
	return (
		<section id="how" className="py-20 px-6">
			<div className="max-w-[1080px] mx-auto">
				<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">How it works</p>
				<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">From PR URL to full analysis</h2>
				<div className="divide-y divide-zinc-800 border-y border-zinc-800">
					{STEPS.map((s, i) => (
						<div key={i} className="flex gap-5 py-7">
							<div className="shrink-0 w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center font-mono text-[12px] text-zinc-500">{i + 1}</div>
							<div>
								<h3 className="text-[15px] font-semibold mb-1">{s.title}</h3>
								<p className="text-[13px] text-zinc-400">{s.desc}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function Tools() {
	return (
		<section className="py-20 px-6">
			<div className="max-w-[1080px] mx-auto">
				<p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Chat Tools</p>
				<h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12">AI with access to your PR</h2>
				<div className="border border-zinc-800 rounded-xl overflow-hidden">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="bg-zinc-900">
								<th className="text-left px-4 py-2.5 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Tool</th>
								<th className="text-left px-4 py-2.5 text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Description</th>
							</tr>
						</thead>
						<tbody>
							{TOOLS.map((t) => (
								<tr key={t.name} className="border-t border-zinc-800">
									<td className="px-4 py-3 font-mono text-[12px] text-blue-400 whitespace-nowrap">{t.name}</td>
									<td className="px-4 py-3 text-zinc-400">{t.desc}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}

function BottomCTA() {
	return (
		<section className="py-20 pb-24 text-center px-6">
			<div className="max-w-[1080px] mx-auto">
				<h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">Start reviewing smarter</h2>
				<p className="text-[15px] text-zinc-400 mb-8 max-w-[440px] mx-auto">One command to understand any PR. No configuration needed with Claude Code.</p>
				<div className="flex items-center justify-center gap-3 flex-wrap">
					<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="h-11 px-6 bg-white text-black text-sm font-semibold rounded-[10px] flex items-center hover:opacity-85 transition-opacity">
						Get Started
					</a>
					<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="h-11 px-6 border border-zinc-800 text-zinc-400 text-sm font-medium rounded-[10px] flex items-center hover:text-zinc-100 hover:border-zinc-600 transition-colors">
						View on npm
					</a>
				</div>
			</div>
		</section>
	);
}

function Footer() {
	return (
		<footer className="border-t border-zinc-800 py-8 px-6">
			<div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-zinc-600">
				<span>MIT License</span>
				<div className="flex gap-5">
					<a href="https://github.com/jiwonMe/newpr" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">GitHub</a>
					<a href="https://www.npmjs.com/package/newpr" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">npm</a>
					<a href="https://github.com/jiwonMe" target="_blank" rel="noopener" className="hover:text-zinc-400 transition-colors">@jiwonMe</a>
				</div>
			</div>
		</footer>
	);
}

export function Landing() {
	return (
		<>
			<Nav />
			<Hero />
			<Features />
			<HowItWorks />
			<Tools />
			<BottomCTA />
			<Footer />
		</>
	);
}
