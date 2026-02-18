import { useState, useRef, useCallback } from "react";
import { X, Check, MessageSquare, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { TipTapEditor, getTextWithAnchors } from "./TipTapEditor.tsx";
import type { useEditor } from "@tiptap/react";

type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

const EVENTS: { value: ReviewEvent; label: string; description: string; class: string; activeClass: string }[] = [
	{
		value: "APPROVE",
		label: "Approve",
		description: "Submit approval for this PR",
		class: "text-green-600 dark:text-green-400 hover:bg-green-500/10",
		activeClass: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
	},
	{
		value: "REQUEST_CHANGES",
		label: "Request changes",
		description: "Submit feedback that must be addressed",
		class: "text-red-600 dark:text-red-400 hover:bg-red-500/10",
		activeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
	},
	{
		value: "COMMENT",
		label: "Comment",
		description: "Submit general feedback",
		class: "text-muted-foreground hover:bg-accent/50",
		activeClass: "bg-accent text-foreground border-border",
	},
];

interface ReviewModalProps {
	prUrl: string;
	onClose: () => void;
}

export function ReviewModal({ prUrl, onClose }: ReviewModalProps) {
	const [event, setEvent] = useState<ReviewEvent>("APPROVE");
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; html_url?: string; error?: string } | null>(null);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const handleSubmit = useCallback(async () => {
		if (submitting) return;
		setSubmitting(true);
		setResult(null);
		try {
			const body = editorRef.current ? getTextWithAnchors(editorRef.current) : "";
			const res = await fetch("/api/review", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pr_url: prUrl, event, body }),
			});
			const data = await res.json() as { ok?: boolean; html_url?: string; error?: string };
			if (data.ok) {
				setResult({ ok: true, html_url: data.html_url });
			} else {
				setResult({ ok: false, error: data.error ?? "Failed to submit review" });
			}
		} catch (err) {
			setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
		} finally {
			setSubmitting(false);
		}
	}, [prUrl, event, submitting]);

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
			<div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
			<div
				className="relative z-10 w-full max-w-md rounded-xl border bg-background shadow-lg"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 h-11 border-b">
					<span className="text-xs font-medium">Submit Review</span>
					<button
						type="button"
						onClick={onClose}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>

				<div className="px-4 py-4 space-y-4">
					{result?.ok ? (
						<div className="space-y-4 py-2">
							<div className="flex items-center gap-2 text-green-600 dark:text-green-400">
								<Check className="h-4 w-4" />
								<span className="text-xs font-medium">Review submitted</span>
							</div>
							{result.html_url && (
								<a
									href={result.html_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
								>
									<ExternalLink className="h-3 w-3" />
									View on GitHub
								</a>
							)}
							<div className="flex justify-end">
								<button
									type="button"
									onClick={onClose}
									className="text-[11px] text-muted-foreground/50 hover:text-foreground px-3 py-1.5 rounded-md hover:bg-accent/40 transition-colors"
								>
									Close
								</button>
							</div>
						</div>
					) : (
						<>
							<div className="flex gap-1.5 p-0.5 rounded-lg border">
								{EVENTS.map((e) => (
									<button
										key={e.value}
										type="button"
										onClick={() => setEvent(e.value)}
										className={`flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors border border-transparent ${
											event === e.value ? e.activeClass : e.class
										}`}
									>
										{e.label}
									</button>
								))}
							</div>

							<div>
								<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-2">
									Message {event !== "APPROVE" && <span className="text-red-500/60 normal-case">*</span>}
								</div>
								<div className="rounded-lg border px-3 py-2.5 min-h-[80px] focus-within:border-foreground/15 transition-colors">
									<TipTapEditor
										editorRef={editorRef}
										placeholder={event === "APPROVE" ? "Optional message..." : "Describe the changes needed..."}
										autoFocus
										submitOnModEnter
										onSubmit={handleSubmit}
									/>
								</div>
							</div>

							{result?.error && (
								<div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/5 border border-red-500/20">
									<AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
									<p className="text-[11px] text-red-600 dark:text-red-400">{result.error}</p>
								</div>
							)}

							<div className="flex items-center justify-between pt-1">
								<span className="text-[10px] text-muted-foreground/25">
									{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to submit
								</span>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={onClose}
										className="text-[11px] text-muted-foreground/50 hover:text-foreground px-3 py-1.5 rounded-md hover:bg-accent/40 transition-colors"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleSubmit}
										disabled={submitting}
										className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-30 transition-opacity"
									>
										{submitting ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : event === "APPROVE" ? (
											<Check className="h-3 w-3" />
										) : (
											<MessageSquare className="h-3 w-3" />
										)}
										Submit
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
