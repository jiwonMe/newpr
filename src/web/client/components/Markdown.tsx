import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Components } from "react-markdown";
import type { Highlighter } from "shiki";
import { ensureHighlighter, getHighlighterSync, langFromClassName } from "../lib/shiki.ts";

interface MarkdownProps {
	children: string;
	onAnchorClick?: (kind: "group" | "file", id: string) => void;
	activeId?: string | null;
}

function useHighlighter(): Highlighter | null {
	const [hl, setHl] = useState<Highlighter | null>(getHighlighterSync());
	useEffect(() => {
		if (!hl) ensureHighlighter().then(setHl).catch(() => {});
	}, [hl]);
	return hl;
}

function useDarkMode(): boolean {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	return dark;
}

const GITHUB_ATTACHMENT_RE = /^https:\/\/github\.com\/user-attachments\/assets\//;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|ogg)(\?|$)/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/i;

function isMediaUrl(href: string): boolean {
	return GITHUB_ATTACHMENT_RE.test(href) || VIDEO_EXT_RE.test(href) || IMAGE_EXT_RE.test(href);
}

function isLikelyVideo(href: string): boolean {
	return VIDEO_EXT_RE.test(href);
}

function proxied(url: string): string {
	if (GITHUB_ATTACHMENT_RE.test(url) || url.startsWith("https://user-images.githubusercontent.com/")) {
		return `/api/proxy?url=${encodeURIComponent(url)}`;
	}
	return url;
}

function MediaEmbed({ src }: { src: string }) {
	const url = proxied(src);
	const [mode, setMode] = useState<"img" | "video" | "link">(isLikelyVideo(src) ? "video" : "img");
	const triedRef = useState(() => new Set<string>())[0];

	function fallback(from: "img" | "video") {
		triedRef.add(from);
		const next = from === "img" ? "video" : "img";
		if (triedRef.has(next)) {
			setMode("link");
		} else {
			setMode(next);
		}
	}

	if (mode === "link") {
		return <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all text-sm">{src}</a>;
	}

	if (mode === "video") {
		return (
			<video
				src={url}
				controls
				playsInline
				className="max-w-full rounded-lg my-2"
				onError={() => fallback("video")}
			/>
		);
	}

	return (
		<img
			src={url}
			alt=""
			className="max-w-full rounded-lg my-2"
			onError={() => fallback("img")}
		/>
	);
}

const ANCHOR_RE = /\[\[(group|file):([^\]]+)\]\]/g;
const BOLD_CJK_RE = /(\*\*[^*]+\*\*)([가-힣ぁ-ヿ一-鿿])/g;

function preprocess(text: string): string {
	return text
		.replace(ANCHOR_RE, (_, kind, id) => {
			const encoded = encodeURIComponent(id);
			return `![${kind}:${encoded}](newpr)`;
		})
		.replace(BOLD_CJK_RE, "$1 $2");
}

export function Markdown({ children, onAnchorClick, activeId }: MarkdownProps) {
	const processed = preprocess(children);
	const hl = useHighlighter();
	const dark = useDarkMode();

	const components: Components = {
		h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3 break-words">{children}</h1>,
		h2: ({ children }) => <h2 className="text-lg font-semibold mt-6 mb-2 break-words">{children}</h2>,
		h3: ({ children }) => <h3 className="text-base font-medium mt-4 mb-1 break-words">{children}</h3>,
		h4: ({ children }) => <h4 className="text-sm font-medium mt-3 mb-1 break-words">{children}</h4>,
		p: ({ children }) => <p className="text-sm leading-relaxed text-foreground/90 break-words mb-3">{children}</p>,
		ul: ({ children }) => <ul className="space-y-1 mb-3">{children}</ul>,
		ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-3 text-sm text-foreground/90">{children}</ol>,
		li: ({ children }) => <li className="text-sm text-muted-foreground ml-4 break-words leading-relaxed">{children}</li>,
		strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
		em: ({ children }) => <em className="italic">{children}</em>,
		code: ({ children, className }) => {
			const lang = langFromClassName(className);
			if (lang && hl) {
				const code = String(children).replace(/\n$/, "");
				const theme = dark ? "github-dark" : "github-light";
				try {
					const html = hl.codeToHtml(code, { lang, theme });
					return <span dangerouslySetInnerHTML={{ __html: html }} />;
				} catch {
					return <code className="text-xs font-mono">{children}</code>;
				}
			}
			if (className?.includes("language-")) {
				return <code className="text-xs font-mono">{children}</code>;
			}
			return <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{children}</code>;
		},
		pre: ({ children }) => (
			<pre className="bg-muted rounded-lg p-4 overflow-x-auto mb-3 whitespace-pre text-xs font-mono [&>span>pre]:!bg-transparent [&>span>pre]:!p-0 [&>span>pre]:!m-0">{children}</pre>
		),
		a: ({ href, children }) => {
			if (href && isMediaUrl(href)) {
				const textContent = String(children ?? "");
				if (textContent === href || !textContent.trim()) {
					return <MediaEmbed src={href} />;
				}
			}
			return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{children}</a>;
		},
		video: ({ src, ...rest }: React.ComponentProps<"video">) => (
			src ? <video src={src} controls playsInline className="max-w-full rounded-lg my-2" {...rest} /> : null
		),
		img: ({ alt, src, ...rest }) => {
			if (src !== "newpr") {
				return <img alt={alt} src={src ? proxied(src) : src} {...rest} className="max-w-full rounded-lg my-2" />;
			}
			if (!alt?.includes(":")) return null;
			const colonIdx = alt.indexOf(":");
			const kind = alt.slice(0, colonIdx) as "group" | "file";
			const id = decodeURIComponent(alt.slice(colonIdx + 1));

			if (!onAnchorClick) {
				if (kind === "group") {
					return <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">{id}</span>;
				}
				return <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-blue-600 dark:text-blue-400">{id.split("/").pop()}</code>;
			}

			const isActive = activeId === `${kind}:${id}`;
			if (kind === "group") {
				return (
					<span
						role="button"
						tabIndex={0}
						onClick={(e) => { e.stopPropagation(); onAnchorClick("group", id); }}
						onKeyDown={(e) => { if (e.key === "Enter") onAnchorClick("group", id); }}
						className={`inline px-1.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
							isActive
								? "bg-blue-500/20 text-blue-500 dark:text-blue-300 ring-1 ring-blue-500/40"
								: "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
						}`}
					>
						{id}
					</span>
				);
			}
			return (
				<span
					role="button"
					tabIndex={0}
					onClick={(e) => { e.stopPropagation(); onAnchorClick("file", id); }}
					onKeyDown={(e) => { if (e.key === "Enter") onAnchorClick("file", id); }}
					className={`inline px-1.5 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer ${
						isActive
							? "bg-muted ring-1 ring-blue-500/40 text-blue-500 dark:text-blue-300"
							: "bg-muted text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
					}`}
				>
					{id.split("/").pop()}
				</span>
			);
		},
		blockquote: ({ children }) => (
			<blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-sm text-muted-foreground italic mb-3">{children}</blockquote>
		),
		details: ({ children, ...rest }) => (
			<details className="rounded-lg border border-border mb-3 open:pb-2" {...rest}>{children}</details>
		),
		summary: ({ children }) => (
			<summary className="px-3 py-2 text-sm font-medium cursor-pointer select-none hover:bg-muted/50 rounded-lg">{children}</summary>
		),
		hr: () => <hr className="border-border my-4" />,
		table: ({ children }) => (
			<div className="overflow-x-auto mb-3">
				<table className="text-sm w-full border-collapse">{children}</table>
			</div>
		),
		th: ({ children }) => <th className="border-b border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">{children}</th>,
		td: ({ children }) => <td className="border-b border-border px-3 py-1.5 text-sm">{children}</td>,
	};

	return <ReactMarkdown remarkPlugins={[[remarkMath, { singleDollarTextMath: true }], remarkGfm]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }], rehypeRaw]} components={components}>{processed}</ReactMarkdown>;
}
