import { useState } from "react";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";

function categorizeError(message: string): { title: string; hint: string; retryable: boolean } {
	const lower = message.toLowerCase();

	if (lower.includes("rate limit") || lower.includes("429")) {
		return {
			title: "Rate limit reached",
			hint: "The API rate limit has been exceeded. Wait a moment before retrying.",
			retryable: true,
		};
	}
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return {
			title: "Request timed out",
			hint: "The analysis took too long. This can happen with very large PRs.",
			retryable: true,
		};
	}
	if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused")) {
		return {
			title: "Connection failed",
			hint: "Could not reach the server. Check your network connection.",
			retryable: true,
		};
	}
	if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token")) {
		return {
			title: "Authentication error",
			hint: "Your GitHub token may be expired or invalid. Run `newpr auth` to reconfigure.",
			retryable: false,
		};
	}
	if (lower.includes("404") || lower.includes("not found")) {
		return {
			title: "PR not found",
			hint: "The pull request could not be found. Check the URL and make sure you have access.",
			retryable: false,
		};
	}
	if (lower.includes("openrouter") || lower.includes("api key")) {
		return {
			title: "API key error",
			hint: "Your OpenRouter API key may be missing or invalid. Set OPENROUTER_API_KEY in your environment.",
			retryable: false,
		};
	}

	return {
		title: "Analysis failed",
		hint: "Something went wrong during the analysis.",
		retryable: true,
	};
}

export function ErrorScreen({
	error,
	onRetry,
	onBack,
}: {
	error: string;
	onRetry?: () => void;
	onBack: () => void;
}) {
	const [retrying, setRetrying] = useState(false);
	const { title, hint, retryable } = categorizeError(error);

	function handleRetry() {
		if (!onRetry) return;
		setRetrying(true);
		onRetry();
	}

	return (
		<div className="flex flex-col items-center justify-center py-24">
			<div className="w-full max-w-md flex flex-col items-center gap-6">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
					<AlertCircle className="h-6 w-6 text-red-500" />
				</div>

				<div className="flex flex-col items-center gap-2 text-center">
					<h2 className="text-lg font-semibold tracking-tight">{title}</h2>
					<p className="text-base text-muted-foreground leading-relaxed max-w-sm">
						{hint}
					</p>
				</div>

				<div className="w-full rounded-lg border bg-muted/50 px-4 py-3">
					<p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
						{error}
					</p>
				</div>

				<div className="flex items-center gap-3">
					{retryable && onRetry && (
						<Button
							onClick={handleRetry}
							disabled={retrying}
							size="default"
						>
							<RotateCcw className={`mr-2 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
							{retrying ? "Retrying..." : "Try again"}
						</Button>
					)}
					<Button
						variant="ghost"
						onClick={onBack}
						size="default"
					>
						<ArrowLeft className="mr-2 h-3.5 w-3.5" />
						Back
					</Button>
				</div>
			</div>
		</div>
	);
}
