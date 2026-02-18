import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { Loader2, ChevronRight, CornerDownLeft } from "lucide-react";
import type { ChatMessage, ChatToolCall, ChatSegment } from "../../../types/output.ts";
import { Markdown } from "./Markdown.tsx";
import { TipTapEditor, getTextWithAnchors, type AnchorItem, type CommandItem } from "./TipTapEditor.tsx";
import type { useEditor } from "@tiptap/react";

export interface ChatState {
	messages: ChatMessage[];
	input: string;
	loading: boolean;
	streaming: { segments: ChatSegment[]; activeToolName?: string } | null;
	loaded: boolean;
	setInput: (v: string) => void;
	sendMessage: (text?: string) => void;
}

interface ChatContextValue {
	state: ChatState;
	anchorItems?: AnchorItem[];
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatState(sessionId?: string | null): ChatState {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [streaming, setStreaming] = useState<ChatState["streaming"]>(null);
	const [loaded, setLoaded] = useState(false);
	const prevSessionId = useRef(sessionId);

	useEffect(() => {
		if (prevSessionId.current !== sessionId) {
			setMessages([]);
			setInput("");
			setLoading(false);
			setStreaming(null);
			setLoaded(false);
			prevSessionId.current = sessionId;
		}
		if (!sessionId) return;
		fetch(`/api/sessions/${sessionId}/chat`)
			.then((r) => r.json())
			.then((data) => {
				setMessages(data as ChatMessage[]);
				setLoaded(true);
			})
			.catch(() => setLoaded(true));
	}, [sessionId]);

	const undoLast = useCallback(async () => {
		if (!sessionId) return;
		setMessages((prev) => {
			const lastAssistantIdx = prev.findLastIndex((m) => m.role === "assistant");
			if (lastAssistantIdx === -1) return prev;
			const lastUserIdx = prev.slice(0, lastAssistantIdx).findLastIndex((m) => m.role === "user");
			const removeFrom = lastUserIdx >= 0 ? lastUserIdx : lastAssistantIdx;
			return prev.slice(0, removeFrom);
		});
		await fetch(`/api/sessions/${sessionId}/chat/undo`, { method: "POST" }).catch(() => {});
	}, [sessionId]);

	const sendMessage = useCallback(async (text?: string) => {
		const messageText = text?.trim() || input.trim();
		if (!sessionId || !messageText || loading) return;

		if (messageText.replace(/\n/g, "").trim() === "/undo") {
			setInput("");
			await undoLast();
			return;
		}

		const userMessage = messageText;
		setInput("");
		setLoading(true);
		setStreaming({ segments: [] });

		setMessages((prev) => [...prev, {
			role: "user",
			content: userMessage,
			timestamp: new Date().toISOString(),
		}]);

		try {
			const res = await fetch(`/api/sessions/${sessionId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: userMessage }),
			});

			if (!res.ok) {
				const err = await res.json() as { error?: string };
				throw new Error(err.error ?? `HTTP ${res.status}`);
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let fullText = "";
			const orderedSegments: ChatSegment[] = [];
			const allToolCalls: ChatToolCall[] = [];
			let pendingEvent = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) {
						pendingEvent = "";
						continue;
					}

					if (trimmed.startsWith("event: ")) {
						pendingEvent = trimmed.slice(7);
						continue;
					}
					if (!trimmed.startsWith("data: ")) continue;

					try {
						const data = JSON.parse(trimmed.slice(6));

						switch (pendingEvent) {
							case "text": {
								fullText += data.content ?? "";
								const lastSeg = orderedSegments[orderedSegments.length - 1];
								if (lastSeg && lastSeg.type === "text") {
									lastSeg.content += data.content ?? "";
								} else {
									orderedSegments.push({ type: "text", content: data.content ?? "" });
								}
								setStreaming({ segments: [...orderedSegments] });
								break;
							}
							case "tool_call": {
								const tc: ChatToolCall = {
									id: data.id,
									name: data.name,
									arguments: data.arguments ?? {},
								};
								allToolCalls.push(tc);
								orderedSegments.push({ type: "tool_call", toolCall: tc });
								setStreaming({ segments: [...orderedSegments], activeToolName: data.name });
								break;
							}
							case "tool_result": {
								const tc = allToolCalls.find((c) => c.id === data.id);
								if (tc) tc.result = data.result;
								setStreaming({ segments: [...orderedSegments] });
								break;
							}
							case "done":
								break;
							case "chat_error":
								throw new Error(data.message ?? "Chat error");
						}
					} catch (parseErr) {
						if (parseErr instanceof Error && parseErr.message === "Chat error") {
							throw parseErr;
						}
					}
					pendingEvent = "";
				}
			}

			setMessages((prev) => [...prev, {
				role: "assistant",
				content: fullText,
				toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
				segments: orderedSegments.length > 0 ? orderedSegments : undefined,
				timestamp: new Date().toISOString(),
			}]);
		} catch (err) {
			setMessages((prev) => [...prev, {
				role: "assistant",
				content: `Error: ${err instanceof Error ? err.message : String(err)}`,
				timestamp: new Date().toISOString(),
			}]);
		} finally {
			setLoading(false);
			setStreaming(null);
		}
	}, [sessionId, input, loading, undoLast]);

	return { messages, input, loading, streaming, loaded, setInput, sendMessage };
}

export function ChatProvider({ state, anchorItems, children }: { state: ChatState; anchorItems?: AnchorItem[]; children: React.ReactNode }) {
	const value = useMemo(() => ({ state, anchorItems }), [state, anchorItems]);
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
				return seg.content ? (
					<div key={`text-${i}`} className="text-xs leading-relaxed">
						<Markdown onAnchorClick={onAnchorClick} activeId={activeId}>{seg.content}</Markdown>
					</div>
				) : null;
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

	return (
		<div ref={containerRef} className="border-t mt-6 pt-5 space-y-5">
			<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">Chat</div>
			{messages.map((msg, i) => {
				if (msg.role === "user") {
					return (
						<div key={`user-${i}`} className="flex justify-end">
							<div className="max-w-[80%] rounded-xl rounded-br-sm bg-foreground text-background px-3.5 py-2 text-[11px] leading-relaxed">
								{msg.content}
							</div>
						</div>
					);
				}
				return (
					<AssistantMessage
						key={`assistant-${i}`}
						segments={segmentsFromMessage(msg)}
						onAnchorClick={onAnchorClick}
						activeId={activeId}
					/>
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
