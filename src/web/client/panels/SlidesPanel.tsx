import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Presentation, RefreshCw, Download, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { NewprOutput, SlideDeck } from "../../../types/output.ts";

export function SlidesPanel({ data, sessionId }: { data: NewprOutput; sessionId?: string | null }) {
	const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [deck, setDeck] = useState<SlideDeck | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState("");
	const [progressDetail, setProgressDetail] = useState<{ current: number; total: number } | null>(null);
	const [currentSlide, setCurrentSlide] = useState(0);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	useEffect(() => {
		if (!sessionId) return;
		fetch(`/api/sessions/${sessionId}/slides`)
			.then((r) => r.json())
			.then((d) => {
				if (d?.slides?.length > 0) {
					setDeck(d as SlideDeck);
					setState("done");
				}
			})
			.catch(() => {});
		return stopPolling;
	}, [sessionId, stopPolling]);

	const startPolling = useCallback(() => {
		if (!sessionId || pollRef.current) return;
		pollRef.current = setInterval(async () => {
			try {
				const res = await fetch(`/api/slides/status?sessionId=${sessionId}`);
				const job = await res.json() as { status: string; message?: string; current?: number; total?: number };
				if (job.message) setProgress(job.message);
				if (job.total && job.total > 0) setProgressDetail({ current: job.current ?? 0, total: job.total });

				if (job.status === "done") {
					stopPolling();
					const loaded = await fetch(`/api/sessions/${sessionId}/slides`).then((r) => r.json()) as SlideDeck | null;
					if (loaded?.slides?.length) {
						setDeck(loaded);
						setState("done");
					}
				} else if (job.status === "error") {
					stopPolling();
					setError(job.message ?? "Generation failed");
					const loaded = await fetch(`/api/sessions/${sessionId}/slides`).then((r) => r.ok ? r.json() : null).catch(() => null) as SlideDeck | null;
					if (loaded?.slides?.length) {
						setDeck(loaded);
						setState("done");
					} else {
						setState("error");
					}
				}
			} catch {}
		}, 1000);
	}, [sessionId, stopPolling]);

	const generate = useCallback(async (resume = false) => {
		if (!sessionId) return;
		setState("loading");
		setError(null);
		setProgress(resume ? "Resuming failed slides..." : "Starting...");
		setProgressDetail(null);

		try {
			const res = await fetch("/api/slides", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, resume }),
			});
			if (!res.ok) {
				const body = await res.json() as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			startPolling();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setState("error");
		}
	}, [sessionId, startPolling]);

	useEffect(() => {
		if (!sessionId || state !== "idle") return;
		fetch(`/api/slides/status?sessionId=${sessionId}`)
			.then((r) => r.json())
			.then((job) => {
				if ((job as { status: string }).status === "running") {
					setState("loading");
					setProgress((job as { message?: string }).message ?? "");
					startPolling();
				}
			})
			.catch(() => {});
	}, [sessionId, state, startPolling]);

	const downloadAll = useCallback(() => {
		if (!deck) return;
		for (const slide of deck.slides) {
			const a = document.createElement("a");
			a.href = `data:${slide.mimeType};base64,${slide.imageBase64}`;
			a.download = `newpr-slide-${slide.index + 1}-${data.meta.pr_number}.png`;
			a.click();
		}
	}, [deck, data.meta.pr_number]);

	if (state === "idle") {
		return (
			<div className="pt-8 flex flex-col items-center">
				<div className="w-full max-w-sm space-y-6">
					<div className="space-y-2">
						<h3 className="text-xs font-medium">Slide Deck</h3>
						<p className="text-[11px] text-muted-foreground/60 leading-relaxed">
							Generate a presentation that explains this PR to your team. The number of slides is automatically determined based on PR complexity.
						</p>
					</div>
					<button
						type="button"
						onClick={() => generate()}
						className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
					>
						<Presentation className="h-3.5 w-3.5" />
						Generate Slides
					</button>
				</div>
			</div>
		);
	}

	if (state === "loading") {
		const pct = progressDetail && progressDetail.total > 0 ? Math.round((progressDetail.current / progressDetail.total) * 100) : 0;
		return (
			<div className="pt-8 flex flex-col items-center">
				<div className="w-full max-w-sm space-y-4">
					<div className="aspect-video rounded-lg border border-dashed border-border/60 flex flex-col items-center justify-center gap-3 px-6">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
						<div className="text-center space-y-2 w-full">
							<p className="text-xs text-muted-foreground/60 line-clamp-2">{progress}</p>
							{progressDetail && progressDetail.total > 0 && (
								<div className="space-y-1">
									<div className="h-1 rounded-full bg-muted overflow-hidden">
										<div className="h-full bg-foreground/40 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
									</div>
									<p className="text-[10px] text-muted-foreground/30 tabular-nums">{progressDetail.current}/{progressDetail.total} slides</p>
								</div>
							)}
							{!progressDetail && <p className="text-[10px] text-muted-foreground/30">This may take 30-90 seconds</p>}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (state === "error") {
		return (
			<div className="pt-8 flex flex-col items-center">
				<div className="w-full max-w-sm space-y-4">
					<div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-2.5">
						<AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
						<div className="space-y-1 min-w-0">
							<p className="text-xs text-destructive font-medium">Generation failed</p>
							<p className="text-[11px] text-destructive/70 break-words">{error}</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => generate(true)}
						className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
					>
						<RefreshCw className="h-3 w-3" />
						Try again
					</button>
				</div>
			</div>
		);
	}

	if (!deck || deck.slides.length === 0) return null;
	const slide = deck.slides[currentSlide];
	if (!slide) return null;
	const total = deck.slides.length;
	const hasFailed = deck.failedIndices && deck.failedIndices.length > 0;

	return (
		<div className="pt-5 space-y-3">
			{hasFailed && (
				<div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
					<AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
					<span className="text-[11px] text-yellow-700 dark:text-yellow-300 flex-1">
						{deck.failedIndices!.length} slide{deck.failedIndices!.length > 1 ? "s" : ""} failed to generate
					</span>
					<button
						type="button"
						onClick={() => generate(true)}
						className="flex items-center gap-1 text-[11px] font-medium text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 shrink-0 transition-colors"
					>
						<RefreshCw className="h-3 w-3" />
						Retry failed
					</button>
				</div>
			)}

			<div className="rounded-lg border overflow-hidden bg-black">
				<img
					src={`data:${slide.mimeType};base64,${slide.imageBase64}`}
					alt={slide.title}
					className="w-full aspect-video object-contain"
				/>
			</div>

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setCurrentSlide((i) => Math.max(0, i - 1))}
						disabled={currentSlide === 0}
						className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground/60 hover:text-foreground hover:border-foreground/20 disabled:opacity-20 transition-colors"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</button>
					<span className="text-[11px] text-muted-foreground/50 tabular-nums min-w-[60px] text-center">
						{currentSlide + 1} / {total}
					</span>
					<button
						type="button"
						onClick={() => setCurrentSlide((i) => Math.min(total - 1, i + 1))}
						disabled={currentSlide === total - 1}
						className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground/60 hover:text-foreground hover:border-foreground/20 disabled:opacity-20 transition-colors"
					>
						<ChevronRight className="h-3.5 w-3.5" />
					</button>
				</div>

				<div className="text-[11px] text-muted-foreground/40 truncate max-w-[50%]">
					{slide.title}
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={downloadAll}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<Download className="h-3 w-3" />
						Download
					</button>
					<button
						type="button"
						onClick={() => generate()}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<RefreshCw className="h-3 w-3" />
						Regenerate
					</button>
				</div>
			</div>

			<div className="flex gap-1.5 overflow-x-auto pb-1">
				{deck.slides.map((s, i) => (
					<button
						key={s.index}
						type="button"
						onClick={() => setCurrentSlide(i)}
						className={`shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
							i === currentSlide ? "border-foreground" : "border-transparent hover:border-border"
						}`}
					>
						<img
							src={`data:${s.mimeType};base64,${s.imageBase64}`}
							alt={s.title}
							className="h-12 aspect-video object-cover"
						/>
					</button>
				))}
			</div>
		</div>
	);
}
