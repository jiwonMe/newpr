import { useState } from "react";
import { BarChart3, Shield } from "lucide-react";
import { getConsent, setConsent, type ConsentState } from "../lib/analytics.ts";

export function AnalyticsConsent({ onDone }: { onDone: () => void }) {
	const [state] = useState<ConsentState>(() => getConsent());

	if (state !== "pending") return null;

	const handleAccept = () => {
		setConsent("granted");
		onDone();
	};

	const handleDecline = () => {
		setConsent("denied");
		onDone();
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center">
			<div className="fixed inset-0 bg-background/70 backdrop-blur-sm" />
			<div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border bg-background shadow-2xl overflow-hidden">
				<div className="px-6 pt-6 pb-4">
					<div className="flex items-center gap-3 mb-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
							<BarChart3 className="h-5 w-5 text-blue-500" />
						</div>
						<div>
							<h2 className="text-sm font-semibold">Help improve newpr</h2>
							<p className="text-[11px] text-muted-foreground">Anonymous usage analytics</p>
						</div>
					</div>

					<p className="text-xs text-muted-foreground leading-relaxed mb-3">
						We'd like to collect anonymous usage data to understand how newpr is used and improve the experience.
					</p>

					<div className="rounded-lg bg-muted/40 px-3.5 py-2.5 space-y-1.5 mb-4">
						<div className="flex items-start gap-2">
							<Shield className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
							<div className="text-[11px] text-muted-foreground leading-relaxed">
								<p className="font-medium text-foreground/80 mb-1">What we collect:</p>
								<ul className="space-y-0.5 list-disc list-inside text-[10.5px]">
									<li>Feature usage (which tabs, buttons, and actions you use)</li>
									<li>Performance metrics (analysis duration, error rates)</li>
									<li>Basic device info (browser, screen size)</li>
								</ul>
							</div>
						</div>
						<div className="flex items-start gap-2 pt-1">
							<Shield className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
							<div className="text-[11px] text-muted-foreground leading-relaxed">
								<p className="font-medium text-foreground/80 mb-1">What we never collect:</p>
								<ul className="space-y-0.5 list-disc list-inside text-[10.5px]">
									<li>PR content, code, or commit messages</li>
									<li>Chat messages or review comments</li>
									<li>API keys, tokens, or personal data</li>
								</ul>
							</div>
						</div>
					</div>

					<p className="text-[10px] text-muted-foreground/50 mb-4">
						Powered by Google Analytics. You can change this anytime in Settings.
					</p>
				</div>

				<div className="flex border-t">
					<button
						type="button"
						onClick={handleDecline}
						className="flex-1 px-4 py-3 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
					>
						Decline
					</button>
					<button
						type="button"
						onClick={handleAccept}
						className="flex-1 px-4 py-3 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
					>
						Accept
					</button>
				</div>
			</div>
		</div>
	);
}
