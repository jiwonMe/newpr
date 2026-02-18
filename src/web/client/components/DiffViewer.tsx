import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from "react";
import { type Highlighter, type ThemedToken } from "shiki";
import { MessageSquare, Trash2, ExternalLink, CornerDownLeft, Pencil, Check, X } from "lucide-react";
import { ensureHighlighter, getHighlighterSync, detectShikiLang, type ShikiLang } from "../lib/shiki.ts";
import type { DiffComment } from "../../../types/output.ts";
import { TipTapEditor } from "./TipTapEditor.tsx";

interface DiffLine {
	type: "header" | "hunk" | "added" | "removed" | "context" | "binary";
	content: string;
	oldNum: number | null;
	newNum: number | null;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const RENDER_CAP = 2000;
const TOTAL_CAP = 3000;

function parseLines(patch: string): DiffLine[] {
	const raw = patch.split("\n");
	const lines: DiffLine[] = [];
	let oldNum = 0;
	let newNum = 0;

	if (raw.some((l) => l.startsWith("Binary files") || l.includes("GIT binary patch"))) {
		return [{ type: "binary", content: "Binary file — cannot display diff", oldNum: null, newNum: null }];
	}

	for (const line of raw) {
		if (
			line.startsWith("diff --git") ||
			line.startsWith("index ") ||
			line.startsWith("--- ") ||
			line.startsWith("+++ ") ||
			line.startsWith("old mode") ||
			line.startsWith("new mode") ||
			line.startsWith("new file mode") ||
			line.startsWith("deleted file mode") ||
			line.startsWith("rename from") ||
			line.startsWith("rename to") ||
			line.startsWith("similarity index")
		) {
			lines.push({ type: "header", content: line, oldNum: null, newNum: null });
			continue;
		}

		const hunkMatch = line.match(HUNK_RE);
		if (hunkMatch) {
			oldNum = Number(hunkMatch[1]);
			newNum = Number(hunkMatch[2]);
			lines.push({ type: "hunk", content: line, oldNum: null, newNum: null });
			continue;
		}

		if (line.startsWith("+")) {
			lines.push({ type: "added", content: line.slice(1), oldNum: null, newNum: newNum });
			newNum++;
		} else if (line.startsWith("-")) {
			lines.push({ type: "removed", content: line.slice(1), oldNum: oldNum, newNum: null });
			oldNum++;
		} else if (line.startsWith("\\")) {
			lines.push({ type: "context", content: line, oldNum: null, newNum: null });
		} else {
			const text = line.startsWith(" ") ? line.slice(1) : line;
			if (oldNum > 0 || newNum > 0) {
				lines.push({ type: "context", content: text, oldNum: oldNum, newNum: newNum });
				oldNum++;
				newNum++;
			} else {
				lines.push({ type: "context", content: text, oldNum: null, newNum: null });
			}
		}
	}

	return lines;
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

type TokenMap = Map<number, ThemedToken[]>;

function useTokenizedLines(
	hl: Highlighter | null,
	lines: DiffLine[],
	lang: ShikiLang | null,
	dark: boolean,
): TokenMap | null {
	return useMemo(() => {
		if (!hl || !lang) return null;

		const codeIndices: number[] = [];
		const codeLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const t = lines[i]!.type;
			if (t === "added" || t === "removed" || t === "context") {
				codeIndices.push(i);
				codeLines.push(lines[i]!.content);
			}
		}

		if (codeLines.length === 0) return null;

		try {
			const theme = dark ? "github-dark" : "github-light";
			const result = hl.codeToTokens(codeLines.join("\n"), { lang, theme });
			const map: TokenMap = new Map();
			for (let j = 0; j < codeIndices.length; j++) {
				const tokens = result.tokens[j];
				if (tokens) map.set(codeIndices[j]!, tokens);
			}
			return map;
		} catch {
			return null;
		}
	}, [hl, lines, lang, dark]);
}

function renderHighlighted(tokens: ThemedToken[]): ReactNode {
	return tokens.map((t, i) => (
		<span key={i} style={t.color ? { color: t.color } : undefined}>{t.content}</span>
	));
}

const ROW_STYLE: Record<DiffLine["type"], string> = {
	header: "text-muted-foreground",
	hunk: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	added: "bg-green-500/10",
	removed: "bg-red-500/10",
	context: "",
	binary: "text-muted-foreground italic py-4 text-center",
};

const GUTTER_STYLE: Record<string, string> = {
	added: "bg-green-500/15 text-green-600/60 dark:text-green-400/60",
	removed: "bg-red-500/15 text-red-600/60 dark:text-red-400/60",
	default: "text-muted-foreground/40",
};

const PREFIX_STYLE: Record<string, string> = {
	added: "text-green-700 dark:text-green-300 select-none",
	removed: "text-red-700 dark:text-red-300 select-none",
	context: "text-transparent select-none",
};

let cachedUser: { login: string; avatar_url: string } | null = null;
async function getCurrentUser(): Promise<{ login: string; avatar_url: string } | null> {
	if (cachedUser) return cachedUser;
	try {
		const res = await fetch("/api/me");
		const data = await res.json() as Record<string, unknown>;
		if (data.login) {
			cachedUser = { login: data.login as string, avatar_url: data.avatar_url as string };
		}
	} catch {}
	return cachedUser;
}

function formatTimeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function commentKey(side: "old" | "new", line: number): string {
	return `${side}:${line}`;
}

function lineKey(line: DiffLine): { side: "old" | "new"; num: number } | null {
	if (line.type === "added" && line.newNum != null) return { side: "new", num: line.newNum };
	if (line.type === "removed" && line.oldNum != null) return { side: "old", num: line.oldNum };
	if (line.type === "context" && line.newNum != null) return { side: "new", num: line.newNum };
	return null;
}

function CommentCard({
	comment,
	currentLogin,
	onEdit,
	onDelete,
}: {
	comment: DiffComment;
	currentLogin: string | null;
	onEdit: (id: string, body: string) => Promise<void>;
	onDelete: (id: string) => void;
}) {
	const [deleting, setDeleting] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editBody, setEditBody] = useState(comment.body);
	const [saving, setSaving] = useState(false);
	const isOwn = currentLogin === comment.author;

	const handleSave = useCallback(async () => {
		const trimmed = editBody.trim();
		if (!trimmed || saving || trimmed === comment.body) { setEditing(false); return; }
		setSaving(true);
		try {
			await onEdit(comment.id, trimmed);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}, [editBody, saving, comment.id, comment.body, onEdit]);

	return (
		<div className="group/comment px-3 py-2.5">
			<div className="flex items-center gap-1.5 mb-1">
				{comment.authorAvatar ? (
					<img src={comment.authorAvatar} alt="" className="h-4 w-4 rounded-full shrink-0" />
				) : (
					<div className="h-4 w-4 rounded-full bg-muted-foreground/20 shrink-0" />
				)}
				<span className="text-[11px] font-medium text-foreground/90">{comment.author}</span>
				<span className="text-[10px] text-muted-foreground/60">{formatTimeAgo(comment.createdAt)}</span>
				{comment.startLine != null && comment.startLine !== comment.line && (
					<span className="text-[10px] text-muted-foreground/40 font-mono">L{comment.startLine}-{comment.line}</span>
				)}
				{comment.githubUrl && (
					<a href={comment.githubUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-foreground/60 transition-colors">
						<ExternalLink className="h-2.5 w-2.5" />
					</a>
				)}
				{isOwn && !editing && (
					<div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity">
						<button
							type="button"
							onClick={() => { setEditBody(comment.body); setEditing(true); }}
							className="p-0.5 -m-0.5 rounded text-muted-foreground/40 hover:text-foreground/70"
						>
							<Pencil className="h-3 w-3" />
						</button>
						<button
							type="button"
							disabled={deleting}
							onClick={() => { setDeleting(true); onDelete(comment.id); }}
							className="p-0.5 -m-0.5 rounded text-muted-foreground/40 hover:text-red-500"
						>
							<Trash2 className="h-3 w-3" />
						</button>
					</div>
				)}
			</div>
		{editing ? (
			<div className="pl-[22px]">
				<div className="border rounded-md px-2 py-1.5 focus-within:border-foreground/20 min-h-[36px]">
					<TipTapEditor
						content={editBody}
						onChange={setEditBody}
						autoFocus
						submitOnModEnter
						onSubmit={handleSave}
						onEscape={() => setEditing(false)}
					/>
				</div>
				<div className="flex items-center justify-end gap-1.5 mt-1">
					<button
						type="button"
						onClick={() => setEditing(false)}
						className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground/70 transition-colors"
					>
						<X className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!editBody.trim() || saving}
						className={`p-1 rounded-md transition-colors ${editBody.trim() && !saving ? "text-foreground/80 hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"}`}
					>
						<Check className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
			) : (
				<p className="text-[12px] text-foreground/80 whitespace-pre-wrap break-words leading-[1.6] pl-[22px]">{comment.body}</p>
			)}
		</div>
	);
}

function CommentForm({
	currentUser,
	onSubmit,
	onCancel,
}: {
	currentUser: { login: string; avatar_url: string } | null;
	onSubmit: (body: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [body, setBody] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = useCallback(async () => {
		const trimmed = body.trim();
		if (!trimmed || submitting) return;
		setSubmitting(true);
		try {
			await onSubmit(trimmed);
		} finally {
			setSubmitting(false);
		}
	}, [body, submitting, onSubmit]);

	const hasContent = body.trim().length > 0;
	const modKey = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "\u2318" : "Ctrl";

	return (
		<div className="px-3 py-2.5">
			<div className="rounded-lg border border-border/60 transition-colors focus-within:border-foreground/20 focus-within:shadow-sm">
				<div className="flex items-start gap-2 p-2">
					{currentUser?.avatar_url ? (
						<img src={currentUser.avatar_url} alt="" className="h-5 w-5 rounded-full shrink-0 mt-0.5" />
					) : (
						<div className="h-5 w-5 rounded-full bg-muted-foreground/20 shrink-0 mt-0.5" />
					)}
					<div className="flex-1 min-h-[44px]">
						<TipTapEditor
							placeholder="Write a comment..."
							autoFocus
							submitOnModEnter
							onSubmit={handleSubmit}
							onChange={setBody}
							onEscape={onCancel}
						/>
					</div>
				</div>
				<div className="flex items-center justify-end gap-2 px-2 pb-2">
					<button
						type="button"
						onClick={onCancel}
						className="text-[11px] text-muted-foreground/60 hover:text-foreground/80 px-2 py-1 rounded-md transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!hasContent || submitting}
						className={`
							text-[11px] font-medium px-3 py-1 rounded-md transition-all
							${hasContent && !submitting
								? "bg-foreground text-background hover:bg-foreground/90"
								: "bg-muted text-muted-foreground/40 cursor-not-allowed"}
						`}
					>
						{submitting ? "Posting..." : "Comment"}
					</button>
					<kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground/40 select-none">
						{modKey}<CornerDownLeft className="h-2.5 w-2.5" />
					</kbd>
				</div>
			</div>
		</div>
	);
}

function InlineComments({
	comments,
	currentUser,
	onEdit,
	onDelete,
	formTarget,
	onSubmit,
	onCancel,
}: {
	comments: DiffComment[];
	currentUser: { login: string; avatar_url: string } | null;
	onEdit: (id: string, body: string) => Promise<void>;
	onDelete: (id: string) => void;
	formTarget: boolean;
	onSubmit: (body: string) => Promise<void>;
	onCancel: () => void;
}) {
	const hasComments = comments.length > 0;
	if (!hasComments && !formTarget) return null;

	return (
		<div className="border-y border-border/30 bg-card/80 font-sans divide-y divide-border/20">
			{comments.map((c) => (
				<CommentCard key={c.id} comment={c} currentLogin={currentUser?.login ?? null} onEdit={onEdit} onDelete={onDelete} />
			))}
			{formTarget && <CommentForm currentUser={currentUser} onSubmit={onSubmit} onCancel={onCancel} />}
		</div>
	);
}

export function DiffViewer({
	patch,
	filePath,
	sessionId,
	githubUrl,
	scrollToLine,
	scrollToLineEnd,
}: {
	patch: string;
	filePath: string;
	sessionId?: string | null;
	githubUrl?: string;
	scrollToLine?: number;
	scrollToLineEnd?: number;
}) {
	const [showAll, setShowAll] = useState(false);
	const hl = useHighlighter();
	const dark = useDarkMode();
	const lang = useMemo(() => detectShikiLang(filePath), [filePath]);
	const allLines = useMemo(() => parseLines(patch), [patch]);
	const tokenMap = useTokenizedLines(hl, allLines, lang, dark);
	const isCapped = !showAll && allLines.length > TOTAL_CAP;
	const lines = isCapped ? allLines.slice(0, RENDER_CAP) : allLines;
	const fileName = filePath.split("/").pop() ?? filePath;

	const scrollRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [visibleWidth, setVisibleWidth] = useState(0);

	const highlightedRef = useRef<HTMLElement[]>([]);

	useEffect(() => {
		for (const el of highlightedRef.current) {
			el.style.boxShadow = "";
		}
		highlightedRef.current = [];

		if (!scrollToLine || !containerRef.current) return;
		const endLine = scrollToLineEnd ?? scrollToLine;
		const timer = setTimeout(() => {
			const container = containerRef.current;
			if (!container) return;
			let scrollTarget: HTMLElement | null = null;
			for (let n = scrollToLine; n <= endLine; n++) {
				const el = container.querySelector(`[data-line-new="${n}"]`) as HTMLElement | null;
				if (el) {
					el.style.boxShadow = "inset 0 0 0 9999px oklch(0.623 0.214 259.815 / 0.12)";
					highlightedRef.current.push(el);
					if (!scrollTarget) scrollTarget = el;
				}
			}
			scrollTarget?.scrollIntoView({ behavior: "instant", block: "center" });
		}, 100);
		return () => clearTimeout(timer);
	}, [scrollToLine, scrollToLineEnd, patch]);
	const [comments, setComments] = useState<DiffComment[]>([]);
	const [currentUser, setCurrentUser] = useState<{ login: string; avatar_url: string } | null>(null);
	const [formRange, setFormRange] = useState<{ side: "old" | "new"; startLine: number; endLine: number } | null>(null);
	const dragRef = useRef<{ side: "old" | "new"; num: number } | null>(null);
	const dragRangeRef = useRef<{ side: "old" | "new"; start: number; end: number } | null>(null);
	const [dragRange, setDragRange] = useState<{ side: "old" | "new"; start: number; end: number } | null>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		setVisibleWidth(el.clientWidth);
		const observer = new ResizeObserver(() => setVisibleWidth(el.clientWidth));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!sessionId) return;
		fetch(`/api/sessions/${sessionId}/comments?path=${encodeURIComponent(filePath)}`)
			.then((r) => r.ok ? r.json() : [])
			.then((data) => setComments(data as DiffComment[]))
			.catch(() => {});
	}, [sessionId, filePath]);

	useEffect(() => {
		getCurrentUser().then((u) => {
			if (u) setCurrentUser(u);
		});
	}, []);

	const { commentsByKey, commentedLines } = useMemo(() => {
		const map = new Map<string, DiffComment[]>();
		const lineSet = new Set<string>();
		for (const c of comments) {
			const key = commentKey(c.side, c.line);
			const arr = map.get(key);
			if (arr) arr.push(c);
			else map.set(key, [c]);
			const start = c.startLine ?? c.line;
			for (let n = start; n <= c.line; n++) lineSet.add(commentKey(c.side, n));
		}
		return { commentsByKey: map, commentedLines: lineSet };
	}, [comments]);

	const handleAddComment = useCallback(async (body: string) => {
		if (!sessionId || !formRange) return;
		const payload: Record<string, unknown> = {
			filePath,
			line: formRange.endLine,
			side: formRange.side,
			body,
		};
		if (formRange.startLine !== formRange.endLine) {
			payload.startLine = formRange.startLine;
		}
		const res = await fetch(`/api/sessions/${sessionId}/comments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (res.ok) {
			const comment = await res.json() as DiffComment;
			setComments((prev) => [...prev, comment]);
			setFormRange(null);
		}
	}, [sessionId, filePath, formRange]);

	const handleEditComment = useCallback(async (commentId: string, body: string) => {
		if (!sessionId) return;
		const res = await fetch(`/api/sessions/${sessionId}/comments/${commentId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ body }),
		});
		if (res.ok) {
			const updated = await res.json() as DiffComment;
			setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
		}
	}, [sessionId]);

	const handleDeleteComment = useCallback(async (commentId: string) => {
		if (!sessionId) return;
		const res = await fetch(`/api/sessions/${sessionId}/comments/${commentId}`, { method: "DELETE" });
		if (res.ok) {
			setComments((prev) => prev.filter((c) => c.id !== commentId));
		}
	}, [sessionId]);

	const handleMouseDown = useCallback((side: "old" | "new", num: number, e: React.MouseEvent) => {
		e.preventDefault();
		dragRef.current = { side, num };
		const r = { side, start: num, end: num };
		dragRangeRef.current = r;
		setDragRange(r);
	}, []);

	const handleMouseEnter = useCallback((side: "old" | "new", num: number) => {
		const dr = dragRef.current;
		if (!dr || dr.side !== side) return;
		const start = Math.min(dr.num, num);
		const end = Math.max(dr.num, num);
		const r = { side, start, end };
		dragRangeRef.current = r;
		setDragRange(r);
	}, []);

	useEffect(() => {
		const handleUp = () => {
			const dr = dragRef.current;
			const range = dragRangeRef.current;
			dragRef.current = null;
			dragRangeRef.current = null;
			setDragRange(null);
			if (!dr || !range) return;
			setFormRange((prev) => {
				if (prev && prev.side === range.side && prev.startLine === range.start && prev.endLine === range.end) return null;
				return { side: range.side, startLine: range.start, endLine: range.end };
			});
		};
		document.addEventListener("mouseup", handleUp);
		return () => document.removeEventListener("mouseup", handleUp);
	}, []);

	const commentCount = comments.length;

	return (
		<div ref={containerRef} className="rounded-lg border overflow-hidden">
			<div className="sticky top-0 z-10 bg-muted px-3 py-1.5 border-b flex items-center gap-2">
				<span className="text-xs font-mono font-medium truncate flex-1" title={filePath}>
					{fileName}
				</span>
				{commentCount > 0 && (
					<span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
						<MessageSquare className="h-3 w-3" />
						{commentCount}
					</span>
				)}
			</div>
			<div ref={scrollRef} className="overflow-x-auto">
				<div className="min-w-max font-mono text-xs leading-5 select-text">
					{lines.map((line, i) => {
						if (line.type === "binary") {
							return (
								<div key={i} className={ROW_STYLE.binary}>
									{line.content}
								</div>
							);
						}

						if (line.type === "header") {
							return (
								<div key={i} className={`px-3 ${ROW_STYLE.header}`}>
									{line.content}
								</div>
							);
						}

						if (line.type === "hunk") {
							return (
								<div key={i} className={`px-3 py-0.5 ${ROW_STYLE.hunk}`}>
									{line.content}
								</div>
							);
						}

						const gutterStyle = GUTTER_STYLE[line.type] ?? GUTTER_STYLE.default;
						const prefix = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
						const prefixStyle = PREFIX_STYLE[line.type] ?? PREFIX_STYLE.context;
						const tokens = tokenMap?.get(i);
						const content = tokens ? renderHighlighted(tokens) : line.content;
						const lk = lineKey(line);
						const key = lk ? commentKey(lk.side, lk.num) : null;
						const lineComments = key ? commentsByKey.get(key) ?? [] : [];
						const canComment = sessionId && lk != null;

						const inDrag = canComment && dragRange != null && dragRange.side === lk.side && lk.num >= dragRange.start && lk.num <= dragRange.end;
						const inFormRange = canComment && formRange != null && formRange.side === lk.side && lk.num >= formRange.startLine && lk.num <= formRange.endLine;
						const isFormAnchor = canComment && formRange != null && formRange.side === lk.side && formRange.endLine === lk.num;
						const hasComment = key != null && commentedLines.has(key);
						const hasInline = lineComments.length > 0 || isFormAnchor;

						const selectShadow = inDrag
							? "inset 0 0 0 9999px oklch(0.623 0.214 259.815 / 0.20)"
							: inFormRange
								? "inset 0 0 0 9999px oklch(0.623 0.214 259.815 / 0.15)"
								: hasComment
									? "inset 0 0 0 9999px oklch(0.623 0.214 259.815 / 0.08)"
									: undefined;

						return (
							<div key={i}>
								<div
									className={`flex ${ROW_STYLE[line.type]} ${canComment ? "cursor-pointer select-none hover:brightness-[1.15] dark:hover:brightness-[1.3]" : ""}`}
									style={selectShadow ? { boxShadow: selectShadow } : undefined}
									data-line-new={line.newNum ?? undefined}
									data-line-old={line.oldNum ?? undefined}
									onMouseDown={canComment ? (e) => handleMouseDown(lk.side, lk.num, e) : undefined}
									onMouseEnter={canComment ? () => handleMouseEnter(lk.side, lk.num) : undefined}
								>
									{hasComment && <span className="inline-block w-[3px] shrink-0 bg-blue-500/60" />}
									<span className={`inline-block ${hasComment ? "w-[37px]" : "w-10"} shrink-0 text-right pr-1 select-none ${gutterStyle}`}>
										{line.oldNum ?? ""}
									</span>
									<span className={`inline-block w-10 shrink-0 text-right pr-1 select-none border-r border-border/50 ${gutterStyle}`}>
										{line.newNum ?? ""}
									</span>
									<span className={`inline-block w-4 shrink-0 text-center ${prefixStyle}`}>{prefix}</span>
									<span className="pr-3 whitespace-pre">{content}</span>
								</div>
								{hasInline && (
									<div className="sticky left-0" style={visibleWidth ? { width: visibleWidth } : undefined}>
									<InlineComments
										comments={lineComments}
										currentUser={currentUser}
										onEdit={handleEditComment}
										onDelete={handleDeleteComment}
										formTarget={!!isFormAnchor}
										onSubmit={handleAddComment}
										onCancel={() => setFormRange(null)}
									/>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			{isCapped && (
				<button
					type="button"
					onClick={() => setShowAll(true)}
					className="w-full py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-accent/50 transition-colors border-t"
				>
					Show all {allLines.length} lines
				</button>
			)}
			{githubUrl && (
				<div className="px-3 py-2 border-t text-center">
					<a
						href={githubUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
					>
						View on GitHub
					</a>
				</div>
			)}
		</div>
	);
}
