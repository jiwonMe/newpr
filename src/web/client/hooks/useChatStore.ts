import { useEffect, useCallback, useSyncExternalStore } from "react";
import type { ChatMessage, ChatToolCall, ChatSegment } from "../../../types/output.ts";

interface ChatSessionState {
	messages: ChatMessage[];
	loading: boolean;
	streaming: { segments: ChatSegment[]; activeToolName?: string } | null;
	loaded: boolean;
}

type Listener = () => void;

class ChatStore {
	private sessions = new Map<string, ChatSessionState>();
	private listeners = new Set<Listener>();
	private abortControllers = new Map<string, AbortController>();

	private getOrCreate(sessionId: string): ChatSessionState {
		let s = this.sessions.get(sessionId);
		if (!s) {
			s = { messages: [], loading: false, streaming: null, loaded: false };
			this.sessions.set(sessionId, s);
		}
		return s;
	}

	private notify() {
		for (const l of this.listeners) l();
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getState(sessionId: string): ChatSessionState {
		return this.getOrCreate(sessionId);
	}

	isLoading(sessionId: string): boolean {
		return this.sessions.get(sessionId)?.loading ?? false;
	}

	getLoadingSessions(): Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> {
		const result: Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> = [];
		for (const [id, s] of this.sessions) {
			if (s.loading) result.push({ sessionId: id, streaming: s.streaming });
		}
		return result;
	}

	async loadHistory(sessionId: string): Promise<void> {
		const s = this.getOrCreate(sessionId);
		if (s.loaded) return;
		try {
			const res = await fetch(`/api/sessions/${sessionId}/chat`);
			const data = await res.json() as ChatMessage[];
			s.messages = data;
			s.loaded = true;
		} catch {
			s.loaded = true;
		}
		this.notify();
	}

	async sendMessage(sessionId: string, text: string): Promise<void> {
		const s = this.getOrCreate(sessionId);
		if (s.loading) return;

		const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
		s.messages = [...s.messages, userMsg];
		s.loading = true;
		s.streaming = { segments: [] };
		this.notify();

		const controller = new AbortController();
		this.abortControllers.set(sessionId, controller);

		try {
			const res = await fetch(`/api/sessions/${sessionId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: text }),
				signal: controller.signal,
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
					if (!trimmed) { pendingEvent = ""; continue; }
					if (trimmed.startsWith("event: ")) { pendingEvent = trimmed.slice(7); continue; }
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
								s.streaming = { segments: [...orderedSegments] };
								this.notify();
								break;
							}
							case "tool_call": {
								const tc: ChatToolCall = { id: data.id, name: data.name, arguments: data.arguments ?? {} };
								allToolCalls.push(tc);
								orderedSegments.push({ type: "tool_call", toolCall: tc });
								s.streaming = { segments: [...orderedSegments], activeToolName: data.name };
								this.notify();
								break;
							}
							case "tool_result": {
								const tc = allToolCalls.find((c) => c.id === data.id);
								if (tc) tc.result = data.result;
								s.streaming = { segments: [...orderedSegments] };
								this.notify();
								break;
							}
							case "done": break;
							case "chat_error": throw new Error(data.message ?? "Chat error");
						}
					} catch (parseErr) {
						if (parseErr instanceof Error && parseErr.message === "Chat error") throw parseErr;
					}
					pendingEvent = "";
				}
			}

			s.messages = [...s.messages, {
				role: "assistant",
				content: fullText,
				toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
				segments: orderedSegments.length > 0 ? orderedSegments : undefined,
				timestamp: new Date().toISOString(),
			}];
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				s.messages = [...s.messages, {
					role: "assistant",
					content: `Error: ${err instanceof Error ? err.message : String(err)}`,
					timestamp: new Date().toISOString(),
				}];
			}
		} finally {
			s.loading = false;
			s.streaming = null;
			this.abortControllers.delete(sessionId);
			this.notify();
		}
	}

	async undo(sessionId: string): Promise<void> {
		const s = this.getOrCreate(sessionId);
		const lastAssistantIdx = s.messages.findLastIndex((m) => m.role === "assistant");
		if (lastAssistantIdx === -1) return;
		const lastUserIdx = s.messages.slice(0, lastAssistantIdx).findLastIndex((m) => m.role === "user");
		const removeFrom = lastUserIdx >= 0 ? lastUserIdx : lastAssistantIdx;
		s.messages = s.messages.slice(0, removeFrom);
		this.notify();
		await fetch(`/api/sessions/${sessionId}/chat/undo`, { method: "POST" }).catch(() => {});
	}
}

export const chatStore = new ChatStore();

export function useChatStore(sessionId?: string | null) {
	const stableId = sessionId ?? "";

	const state = useSyncExternalStore(
		(cb) => chatStore.subscribe(cb),
		() => stableId ? chatStore.getState(stableId) : null,
	);

	useEffect(() => {
		if (stableId) chatStore.loadHistory(stableId);
	}, [stableId]);

	const sendMessage = useCallback((text?: string) => {
		const msg = text?.trim();
		if (!stableId || !msg) return;
		if (msg.replace(/\n/g, "").trim() === "/undo") {
			chatStore.undo(stableId);
			return;
		}
		chatStore.sendMessage(stableId, msg);
	}, [stableId]);

	return {
		messages: state?.messages ?? [],
		loading: state?.loading ?? false,
		streaming: state?.streaming ?? null,
		loaded: state?.loaded ?? false,
		sendMessage,
	};
}

export function useChatLoadingIndicator(): Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> {
	return useSyncExternalStore(
		(cb) => chatStore.subscribe(cb),
		() => chatStore.getLoadingSessions(),
	);
}
