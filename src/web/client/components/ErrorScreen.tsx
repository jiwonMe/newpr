import { useState } from "react";
import { AlertCircle, RotateCcw, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { useI18n, type TranslationKey } from "../lib/i18n/index.ts";

function categorizeError(message: string): { titleKey: TranslationKey; hintKey: TranslationKey; retryable: boolean } {
	const lower = message.toLowerCase();

	if (lower.includes("rate limit") || lower.includes("429")) {
		return { titleKey: "error.rateLimitTitle", hintKey: "error.rateLimitHint", retryable: true };
	}
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return { titleKey: "error.timeoutTitle", hintKey: "error.timeoutHint", retryable: true };
	}
	if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused")) {
		return { titleKey: "error.networkTitle", hintKey: "error.networkHint", retryable: true };
	}
	if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token")) {
		return { titleKey: "error.authTitle", hintKey: "error.authHint", retryable: false };
	}
	if (lower.includes("404") || lower.includes("not found")) {
		return { titleKey: "error.notFoundTitle", hintKey: "error.notFoundHint", retryable: false };
	}
	if (lower.includes("openrouter") || lower.includes("api key")) {
		return { titleKey: "error.apiKeyTitle", hintKey: "error.apiKeyHint", retryable: false };
	}

	return { titleKey: "error.defaultTitle", hintKey: "error.defaultHint", retryable: true };
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
	const { t } = useI18n();
	const { titleKey, hintKey, retryable } = categorizeError(error);

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
					<h2 className="text-lg font-semibold tracking-tight">{t(titleKey)}</h2>
					<p className="text-base text-muted-foreground leading-relaxed max-w-sm">
						{t(hintKey)}
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
							{retrying ? t("common.retrying") : t("common.tryAgain")}
						</Button>
					)}
					<Button
						variant="ghost"
						onClick={onBack}
						size="default"
					>
						<ArrowLeft className="mr-2 h-3.5 w-3.5" />
						{t("common.back")}
					</Button>
				</div>
			</div>
		</div>
	);
}
