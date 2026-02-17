import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { Loader2, Wrench, ChevronDown, ChevronRight, CornerDownLeft } from "lucide-react";
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
		<div className="border rounded-lg overflow-hidden text-[11px]">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 hover:bg-muted transition-colors text-left"
			>
				<Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
				<span className="font-mono font-medium">{tc.name}</span>
				{Object.keys(tc.arguments).length > 0 && (
					<span className="text-muted-foreground truncate">
						({Object.entries(tc.arguments).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})
					</span>
				)}
				<span className="ml-auto shrink-0">
					{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
				</span>
			</button>
			{open && tc.result && (
				<pre className="px-2.5 py-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-muted/20">
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
	onAnchorClick?: (kind: "group" | "file", id: string) => void;
	activeId?: string | null;
}) {
	const hasContent = segments.some((s) => s.type === "text" && s.content);

	return (
		<div className="space-y-2 max-w-[95%]">
			{segments.map((seg, i) => {
				if (seg.type === "tool_call") {
					return <ToolCallDisplay key={seg.toolCall.id} tc={seg.toolCall} />;
				}
				return seg.content ? (
					<div key={`text-${i}`} className="text-xs leading-relaxed prose-compact">
						<Markdown onAnchorClick={onAnchorClick} activeId={activeId}>{seg.content}</Markdown>
					</div>
				) : null;
			})}
			{activeToolName && (
				<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<Loader2 className="h-3 w-3 animate-spin" />
					<span className="font-mono">{activeToolName}</span>
				</div>
			)}
			{isStreaming && !hasContent && !activeToolName && segments.length === 0 && (
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<Loader2 className="h-3 w-3 animate-spin" />
				</div>
			)}
		</div>
	);
}

export function ChatMessages({ onAnchorClick, activeId }: {
	onAnchorClick?: (kind: "group" | "file", id: string) => void;
	activeId?: string | null;
}) {
	const ctx = useContext(ChatContext);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [ctx?.state.messages, ctx?.state.streaming]);

	if (!ctx) return null;
	const { messages, streaming, loaded, loading } = ctx.state;
	const hasMessages = messages.length > 0 || loading;

	if (!hasMessages && loaded) {
		return (
			<div className="border-t mt-5 text-center py-6">
				<p className="text-xs text-muted-foreground">Ask anything about this PR</p>
			</div>
		);
	}

	if (!hasMessages) return null;

	return (
		<div className="border-t mt-5 pt-4 space-y-4">
			{messages.map((msg, i) => {
				if (msg.role === "user") {
					return (
						<div key={`user-${i}`} className="flex justify-end">
							<div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-xs leading-relaxed">
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

			<div ref={messagesEndRef} />
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
				<div className="relative rounded-xl border bg-muted/30 px-4 py-3 pr-12 focus-within:ring-1 focus-within:ring-ring">
					<TipTapEditor
						editorRef={editorRef}
						placeholder="Ask about this PR... (@ to reference)"
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
						className="absolute right-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30 hover:opacity-80"
					>
						{loading ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<CornerDownLeft className="h-3.5 w-3.5" />
						)}
					</button>
				</div>
				<div className="flex justify-center mt-1.5">
					<span className="text-[10px] text-muted-foreground/40">
						Enter to send · Shift+Enter for newline
					</span>
				</div>
			</div>
		</div>
	);
}
