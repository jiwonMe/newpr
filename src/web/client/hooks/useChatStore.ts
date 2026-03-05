import { useEffect, useCallback, useSyncExternalStore } from "react";
import { sendNotification } from "../lib/notify.ts";
import { analytics } from "../lib/analytics.ts";
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

	private update(sessionId: string, patch: Partial<ChatSessionState>) {
		const s = this.getOrCreate(sessionId);
		this.sessions.set(sessionId, { ...s, ...patch });
		this.notify();
	}

	private notify() {
		for (const l of this.listeners) l();
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getState(sessionId: string): ChatSessionState | null {
		return this.sessions.get(sessionId) ?? null;
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
			this.update(sessionId, { messages: data, loaded: true });
		} catch {
			this.update(sessionId, { loaded: true });
		}
	}

	async sendMessage(sessionId: string, text: string): Promise<void> {
		const s = this.getOrCreate(sessionId);
		if (s.loading) return;

		const startTime = Date.now();
		analytics.chatSent();
		const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
		this.update(sessionId, { messages: [...s.messages, userMsg], loading: true, streaming: { segments: [] } });

		const controller = new AbortController();
		this.abortControllers.set(sessionId, controller);

		let phase: "fetch" | "stream" | "parse" = "fetch";
		let receivedEvents = 0;
		let lastEventType = "";
		try {
			const res = await fetch(`/api/sessions/${sessionId}/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: text }),
				signal: controller.signal,
			});

			if (!res.ok) {
				let errBody = "";
				try { const j = await res.json() as { error?: string }; errBody = j.error ?? ""; } catch {}
				throw new Error(errBody || `HTTP ${res.status} ${res.statusText}`);
			}

			phase = "stream";
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
						phase = "parse";
						const data = JSON.parse(trimmed.slice(6));
						receivedEvents++;
						lastEventType = pendingEvent;
						switch (pendingEvent) {
							case "text": {
								fullText += data.content ?? "";
								const lastSeg = orderedSegments[orderedSegments.length - 1];
								if (lastSeg && lastSeg.type === "text") {
									lastSeg.content += data.content ?? "";
								} else {
									orderedSegments.push({ type: "text", content: data.content ?? "" });
								}
								this.update(sessionId, { streaming: { segments: [...orderedSegments] } });
								break;
							}
							case "tool_call": {
								const tc: ChatToolCall = { id: data.id, name: data.name, arguments: data.arguments ?? {} };
								allToolCalls.push(tc);
								orderedSegments.push({ type: "tool_call", toolCall: tc });
								this.update(sessionId, { streaming: { segments: [...orderedSegments], activeToolName: data.name } });
								break;
							}
							case "tool_result": {
								const tc = allToolCalls.find((c) => c.id === data.id);
								if (tc) tc.result = data.result;
								this.update(sessionId, { streaming: { segments: [...orderedSegments], activeToolName: "thinking" } });
								break;
							}
							case "done": break;
							case "chat_error": {
								const serverMsg = data.message ?? "Unknown server error";
								throw Object.assign(new Error(serverMsg), { phase: "server" as const });
							}
						}
						phase = "stream";
					} catch (parseErr) {
						if (parseErr instanceof Error && "phase" in parseErr) throw parseErr;
					}
					pendingEvent = "";
				}
			}

			const cur = this.getOrCreate(sessionId);
			const durationMs = Date.now() - startTime;
			analytics.chatCompleted(Math.round(durationMs / 1000), allToolCalls.length > 0);
			this.update(sessionId, {
				messages: [...cur.messages, {
					role: "assistant",
					content: fullText,
					toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
					segments: orderedSegments.length > 0 ? orderedSegments : undefined,
					timestamp: new Date().toISOString(),
					durationMs,
				}],
			});
			sendNotification("Chat response ready", fullText.slice(0, 100));
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			const raw = err instanceof Error ? err.message : String(err);
			const errPhase = (err as { phase?: string }).phase ?? phase;
			const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
			const debugParts = [`[${errPhase}]`, `after ${elapsed}s`];
			if (receivedEvents > 0) debugParts.push(`${receivedEvents} events received`);
			if (lastEventType) debugParts.push(`last: ${lastEventType}`);
			const debugInfo = debugParts.join(", ");
			const displayMsg = `Error: ${raw}\n\n<details><summary>Debug info</summary>\n\n\`${debugInfo}\`\n\n</details>`;
			console.error(`[newpr chat] ${debugInfo} — ${raw}`, err);
			const cur = this.getOrCreate(sessionId);
			this.update(sessionId, {
				messages: [...cur.messages, {
					role: "assistant",
					content: displayMsg,
					timestamp: new Date().toISOString(),
				}],
			});
		} finally {
			this.update(sessionId, { loading: false, streaming: null });
			this.abortControllers.delete(sessionId);
		}
	}

	async undo(sessionId: string): Promise<void> {
		const s = this.getOrCreate(sessionId);
		const lastAssistantIdx = s.messages.findLastIndex((m) => m.role === "assistant");
		if (lastAssistantIdx === -1) return;
		const lastUserIdx = s.messages.slice(0, lastAssistantIdx).findLastIndex((m) => m.role === "user");
		const removeFrom = lastUserIdx >= 0 ? lastUserIdx : lastAssistantIdx;
		this.update(sessionId, { messages: s.messages.slice(0, removeFrom) });
		await fetch(`/api/sessions/${sessionId}/chat/undo`, { method: "POST" }).catch(() => {});
	}
}

export const chatStore = new ChatStore();

const subscribeFn = (cb: () => void) => chatStore.subscribe(cb);

const EMPTY_STATE: ChatSessionState = { messages: [], loading: false, streaming: null, loaded: false };
const EMPTY_LOADING: Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> = [];

export function useChatStore(sessionId?: string | null) {
	const stableId = sessionId ?? "";

	const getSnapshot = useCallback(
		() => (stableId ? chatStore.getState(stableId) : null) ?? EMPTY_STATE,
		[stableId],
	);

	const state = useSyncExternalStore(subscribeFn, getSnapshot);

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
		messages: state.messages,
		loading: state.loading,
		streaming: state.streaming,
		loaded: state.loaded,
		sendMessage,
	};
}

let lastLoadingSnapshot: Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> = EMPTY_LOADING;

function getLoadingSnapshot() {
	const current = chatStore.getLoadingSessions();
	if (current.length === 0 && lastLoadingSnapshot.length === 0) return lastLoadingSnapshot;
	if (
		current.length === lastLoadingSnapshot.length &&
		current.every((c, i) => c.sessionId === lastLoadingSnapshot[i]?.sessionId)
	) return lastLoadingSnapshot;
	lastLoadingSnapshot = current;
	return lastLoadingSnapshot;
}

export function useChatLoadingIndicator(): Array<{ sessionId: string; streaming: ChatSessionState["streaming"] }> {
	return useSyncExternalStore(subscribeFn, getLoadingSnapshot);
}
