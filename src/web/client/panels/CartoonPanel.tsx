import { useState, useEffect } from "react";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { NewprOutput } from "../../../types/output.ts";

export function CartoonPanel({ data, sessionId }: { data: NewprOutput; sessionId?: string | null }) {
	const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (data.cartoon) {
			setImageUrl(`data:${data.cartoon.mimeType};base64,${data.cartoon.imageBase64}`);
			setState("done");
		}
	}, [data.cartoon]);

	async function generate() {
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
	}

	if (state === "idle") {
		return (
			<div className="pt-6 flex flex-col items-center gap-6 py-20">
				<Sparkles className="h-12 w-12 text-yellow-500/60" />
				<div className="text-center space-y-2">
					<h3 className="text-lg font-semibold">PR 4-Panel Comic</h3>
					<p className="text-sm text-muted-foreground max-w-sm">
						Turn this PR into a fun 4-panel comic strip. Powered by Gemini.
					</p>
				</div>
				<Button onClick={generate} size="lg">
					<Sparkles className="mr-2 h-4 w-4" />
					Generate Comic
				</Button>
			</div>
		);
	}

	if (state === "loading") {
		return (
			<div className="pt-6 flex flex-col items-center gap-4 py-20">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				<p className="text-sm text-muted-foreground">Drawing your PR comic...</p>
				<p className="text-xs text-muted-foreground/60">This may take 10-30 seconds</p>
			</div>
		);
	}

	if (state === "error") {
		return (
			<div className="pt-6 flex flex-col items-center gap-4 py-20">
				<p className="text-sm text-destructive">{error}</p>
				<Button variant="ghost" onClick={generate}>
					<RefreshCw className="mr-2 h-3.5 w-3.5" />
					Try again
				</Button>
			</div>
		);
	}

	return (
		<div className="pt-6 flex flex-col items-center gap-4">
			{imageUrl && (
				<img
					src={imageUrl}
					alt="PR 4-panel comic"
					className="max-w-full rounded-lg border shadow-sm"
				/>
			)}
			<Button variant="ghost" size="sm" onClick={generate}>
				<RefreshCw className="mr-2 h-3.5 w-3.5" />
				Regenerate
			</Button>
		</div>
	);
}
