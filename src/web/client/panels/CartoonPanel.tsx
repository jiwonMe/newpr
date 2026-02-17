import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, RefreshCw, Download, AlertCircle } from "lucide-react";
import type { NewprOutput } from "../../../types/output.ts";

export function CartoonPanel({ data, sessionId }: { data: NewprOutput; sessionId?: string | null }) {
	const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (data.cartoon) {
			setImageUrl(`data:${data.cartoon.mimeType};base64,${data.cartoon.imageBase64}`);
			setState("done");
			return;
		}
		if (!sessionId) return;
		fetch(`/api/sessions/${sessionId}/cartoon`)
			.then((r) => r.json())
			.then((cartoon) => {
				if (cartoon?.imageBase64) {
					setImageUrl(`data:${cartoon.mimeType};base64,${cartoon.imageBase64}`);
					setState("done");
				}
			})
			.catch(() => {});
	}, [data.cartoon, sessionId]);

	const generate = useCallback(async () => {
		setState("loading");
		setError(null);
		try {
			const body: Record<string, unknown> = { data };
			if (sessionId) body.sessionId = sessionId;

			const res = await fetch("/api/cartoon", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const result = await res.json() as { imageBase64?: string; mimeType?: string; error?: string };
			if (result.error) throw new Error(result.error);
			if (!result.imageBase64) throw new Error("No image returned");
			setImageUrl(`data:${result.mimeType};base64,${result.imageBase64}`);
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setState("error");
		}
	}, [data, sessionId]);

	const download = useCallback(() => {
		if (!imageUrl) return;
		const a = document.createElement("a");
		a.href = imageUrl;
		a.download = `newpr-comic-${data.meta.pr_number}.png`;
		a.click();
	}, [imageUrl, data.meta.pr_number]);

	if (state === "idle") {
		return (
			<div className="pt-8 flex flex-col items-center">
				<div className="w-full max-w-sm space-y-6">
					<div className="space-y-2">
						<h3 className="text-xs font-medium">Comic Strip</h3>
						<p className="text-[11px] text-muted-foreground/60 leading-relaxed">
							Generate a 4-panel comic strip that visualizes the key changes in this PR. Powered by Gemini.
						</p>
					</div>
					<button
						type="button"
						onClick={generate}
						className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
					>
						<Sparkles className="h-3.5 w-3.5" />
						Generate
					</button>
				</div>
			</div>
		);
	}

	if (state === "loading") {
		return (
			<div className="pt-8 flex flex-col items-center">
				<div className="w-full max-w-sm space-y-4">
					<div className="aspect-[4/3] rounded-lg border border-dashed border-border/60 flex flex-col items-center justify-center gap-3">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
						<div className="text-center space-y-1">
							<p className="text-xs text-muted-foreground/60">Generating comic...</p>
							<p className="text-[10px] text-muted-foreground/30">This may take 10-30 seconds</p>
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
						onClick={generate}
						className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
					>
						<RefreshCw className="h-3 w-3" />
						Try again
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="pt-6 space-y-3">
			{imageUrl && (
				<div className="rounded-lg border overflow-hidden">
					<img
						src={imageUrl}
						alt="PR 4-panel comic"
						className="w-full"
					/>
				</div>
			)}
			<div className="flex items-center justify-end gap-1.5">
				<button
					type="button"
					onClick={download}
					className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
				>
					<Download className="h-3 w-3" />
					Download
				</button>
				<button
					type="button"
					onClick={generate}
					className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
				>
					<RefreshCw className="h-3 w-3" />
					Regenerate
				</button>
			</div>
		</div>
	);
}
