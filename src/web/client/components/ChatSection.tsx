import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { Loader2, ChevronRight, ChevronDown, CornerDownLeft, FoldVertical } from "lucide-react";
import type { ChatMessage, ChatToolCall, ChatSegment } from "../../../types/output.ts";
import { Markdown } from "./Markdown.tsx";
import { TipTapEditor, getTextWithAnchors, type AnchorItem, type CommandItem } from "./TipTapEditor.tsx";
import type { useEditor } from "@tiptap/react";
import { useChatStore } from "../hooks/useChatStore.ts";

export interface ChatState {
	messages: ChatMessage[];
	loading: boolean;
	streaming: { segments: ChatSegment[]; activeToolName?: string } | null;
	loaded: boolean;
	sendMessage: (text?: string) => void;
}

interface ChatContextValue {
	state: ChatState;
	anchorItems?: AnchorItem[];
	analyzedAt?: string;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export { useChatStore as useChatState };

export function ChatProvider({ state, anchorItems, analyzedAt, children }: { state: ChatState; anchorItems?: AnchorItem[]; analyzedAt?: string; children: React.ReactNode }) {
	const value = useMemo(() => ({ state, anchorItems, analyzedAt }), [state, anchorItems, analyzedAt]);
	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

function ToolCallDisplay({ tc }: { tc: ChatToolCall }) {
	const [open, setOpen] = useState(false);
	const truncated = tc.result && tc.result.length > 200;
	const displayResult = truncated && !open ? `${tc.result!.slice(0, 200)}…` : tc.result;

	return (
		<div className="text-[11px]">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/60 text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors text-left"
			>
				<ChevronRight className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
				<span className="font-mono">{tc.name}</span>
				{Object.keys(tc.arguments).length > 0 && (
					<span className="text-muted-foreground/30 truncate max-w-[200px]">
						{Object.entries(tc.arguments).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}
					</span>
				)}
			</button>
			{open && tc.result && (
				<pre className="mt-1 ml-1 px-2.5 py-2 text-[10px] font-mono text-muted-foreground/50 whitespace-pre-wrap break-all max-h-48 overflow-y-auto rounded-md bg-accent/30">
					{displayResult}
				</pre>
			)}
		</div>
	);
}

function segmentsFromMessage(msg: ChatMessage): ChatSegment[] {
	if (msg.segments && msg.segments.length > 0) return msg.segments;
	const segs: ChatSegment[] = [];
	if (msg.toolCalls && msg.toolCalls.length > 0) {
		for (const tc of msg.toolCalls) {
			segs.push({ type: "tool_call", toolCall: tc });
		}
	}
	if (msg.content) {
		segs.push({ type: "text", content: msg.content });
	}
	return segs;
}

function ThrottledMarkdown({ content, onAnchorClick, activeId }: {
	content: string;
	onAnchorClick?: (kind: "group" | "file" | "line", id: string) => void;
	activeId?: string | null;
}) {
	const [rendered, setRendered] = useState(content);
	const pendingRef = useRef(content);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		pendingRef.current = content;
		if (!timerRef.current) {
			timerRef.current = setTimeout(() => {
				setRendered(pendingRef.current);
				timerRef.current = null;
			}, 150);
		}
		return () => {};
	}, [content]);

	useEffect(() => {
		return () => { if (timerRef.current) clearTimeout(timerRef.current); };
	}, []);

	return <Markdown onAnchorClick={onAnchorClick} activeId={activeId}>{rendered}</Markdown>;
}

function AssistantMessage({ segments, activeToolName, isStreaming, onAnchorClick, activeId }: {
	segments: ChatSegment[];
	activeToolName?: string;
	isStreaming?: boolean;
	onAnchorClick?: (kind: "group" | "file" | "line", id: string) => void;
	activeId?: string | null;
}) {
	const hasContent = segments.some((s) => s.type === "text" && s.content);

	return (
		<div className="space-y-2">
			{segments.map((seg, i) => {
				if (seg.type === "tool_call") {
					return <ToolCallDisplay key={seg.toolCall.id} tc={seg.toolCall} />;
				}
				if (!seg.content) return null;
				return (
					<div key={`text-${i}`} className="text-xs leading-relaxed">
						{isStreaming ? (
							<ThrottledMarkdown content={seg.content} onAnchorClick={onAnchorClick} activeId={activeId} />
						) : (
							<Markdown onAnchorClick={onAnchorClick} activeId={activeId}>{seg.content}</Markdown>
						)}
					</div>
				);
			})}
			{activeToolName && (
				<div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/40 text-[11px] text-muted-foreground/50">
					<Loader2 className="h-2.5 w-2.5 animate-spin" />
					<span className="font-mono">{activeToolName}</span>
				</div>
			)}
			{isStreaming && !hasContent && !activeToolName && segments.length === 0 && (
				<div className="flex items-center gap-1.5">
					<span className="flex gap-1">
						<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />
						<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:150ms]" />
						<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:300ms]" />
					</span>
				</div>
			)}
		</div>
	);
}

function CompactSummary({ message }: { message: ChatMessage }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2 w-full text-left"
			>
				<FoldVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
				<span className="text-[10px] text-muted-foreground/50 flex-1">
					{message.compactedCount ? `${message.compactedCount} messages compacted` : "Conversation compacted"}
				</span>
				{expanded ? (
					<ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
				) : (
					<ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
				)}
			</button>
			{expanded && (
				<div className="mt-2 pt-2 border-t border-dashed text-[11px] text-muted-foreground/60 leading-relaxed">
					<Markdown>{message.content}</Markdown>
				</div>
			)}
		</div>
	);
}

export function ChatMessages({ onAnchorClick, activeId }: {
	onAnchorClick?: (kind: "group" | "file" | "line", id: string) => void;
	activeId?: string | null;
}) {
	const ctx = useContext(ChatContext);
	const containerRef = useRef<HTMLDivElement>(null);
	const isNearBottomRef = useRef(true);
	const mainElRef = useRef<HTMLElement | null>(null);
	const scrollListenerRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (scrollListenerRef.current) return;
		const el = containerRef.current?.closest("main") as HTMLElement | null;
		if (!el) return;
		mainElRef.current = el;
		const onScroll = () => {
			isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		};
		scrollListenerRef.current = onScroll;
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			scrollListenerRef.current = null;
		};
	});

	useEffect(() => {
		const el = mainElRef.current ?? containerRef.current?.closest("main") as HTMLElement | null;
		if (el) {
			mainElRef.current = el;
			if (isNearBottomRef.current) {
				el.scrollTop = el.scrollHeight;
			}
		}
	}, [ctx?.state.messages, ctx?.state.streaming]);

	if (!ctx) return null;
	const { messages, streaming, loaded, loading } = ctx.state;
	const { analyzedAt } = ctx;
	const hasMessages = messages.length > 0 || loading;

	if (!hasMessages && loaded) {
		return (
			<div className="border-t mt-6 pt-6 text-center">
				<p className="text-[11px] text-muted-foreground/40">Ask anything about this PR</p>
				<p className="text-[10px] text-muted-foreground/20 mt-1">@ to reference files · / for commands</p>
			</div>
		);
	}

	if (!hasMessages) return null;

	let shownOutdatedDivider = false;

	return (
		<div ref={containerRef} className="border-t mt-6 pt-5 space-y-5">
			<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Chat</div>
			{messages.map((msg, i) => {
				if (msg.isCompactSummary) {
					return <CompactSummary key={`compact-${i}`} message={msg} />;
				}
				const isFromPreviousAnalysis = analyzedAt && msg.timestamp && msg.timestamp < analyzedAt;
				let divider = null;
				if (isFromPreviousAnalysis && !shownOutdatedDivider) {
					shownOutdatedDivider = true;
					divider = (
						<div className="flex items-center gap-2 py-1">
							<div className="flex-1 h-px bg-yellow-500/20" />
							<span className="text-[10px] text-yellow-600/60 dark:text-yellow-400/50 shrink-0">Previous analysis</span>
							<div className="flex-1 h-px bg-yellow-500/20" />
						</div>
					);
				}
				if (msg.role === "user") {
					return (
						<div key={`user-${i}`}>
							{divider}
							<div className="flex justify-end">
								<div className={`max-w-[80%] rounded-xl rounded-br-sm px-3.5 py-2 text-[11px] leading-relaxed ${
									isFromPreviousAnalysis
										? "bg-foreground/60 text-background"
										: "bg-foreground text-background"
								}`}>
									{msg.content}
								</div>
							</div>
						</div>
					);
				}
				return (
					<div key={`assistant-${i}`}>
						{divider}
						<div className={isFromPreviousAnalysis ? "opacity-60" : ""}>
							<AssistantMessage
								segments={segmentsFromMessage(msg)}
								onAnchorClick={onAnchorClick}
								activeId={activeId}
							/>
						</div>
					</div>
				);
			})}

			{streaming && (
				<AssistantMessage
					segments={streaming.segments}
					activeToolName={streaming.activeToolName}
					onAnchorClick={onAnchorClick}
					activeId={activeId}
					isStreaming
				/>
			)}
		</div>
	);
}

export function ChatInput() {
	const ctx = useContext(ChatContext);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const handleSubmit = useCallback(() => {
		if (!ctx) return;
		const text = editorRef.current ? getTextWithAnchors(editorRef.current) : "";
		if (!text) return;
		editorRef.current?.commands.clearContent();
		ctx.state.sendMessage(text);
	}, [ctx]);

	const chatCommands = useMemo<CommandItem[]>(() => [
		{ id: "undo", label: "/undo", description: "Remove last exchange" },
	], []);

	if (!ctx) return null;
	const { loading } = ctx.state;
	const { anchorItems } = ctx;

	return (
		<div className="px-10 pb-3 pt-2 border-t bg-background">
			<div className="mx-auto max-w-5xl">
				<div className="relative rounded-xl border bg-background px-4 py-2.5 pr-12 focus-within:border-foreground/15 focus-within:shadow-sm transition-all">
					<TipTapEditor
						editorRef={editorRef}
						placeholder="Ask about this PR..."
						disabled={loading}
						submitOnEnter
						onSubmit={handleSubmit}
						className="max-h-[120px] overflow-y-auto"
						anchorItems={anchorItems}
						commands={chatCommands}
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={loading}
						className="absolute right-2.5 bottom-2 flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-20 hover:opacity-80"
					>
						{loading ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<CornerDownLeft className="h-3.5 w-3.5" />
						)}
					</button>
				</div>
				<div className="flex items-center justify-between mt-1.5 px-1">
					<span className="text-[10px] text-muted-foreground/25">
						@ to reference · / for commands
					</span>
					<span className="text-[10px] text-muted-foreground/25">
						Enter to send
					</span>
				</div>
			</div>
		</div>
	);
}
