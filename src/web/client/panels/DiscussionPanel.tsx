import { useState, useEffect, useCallback } from "react";
import { Markdown } from "../components/Markdown.tsx";
import { RefreshCw, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import type { PrComment } from "../../../types/github.ts";
import { useI18n, type TranslationKey } from "../lib/i18n/index.ts";

interface DiscussionData {
	body: string;
	comments: PrComment[];
}

function timeAgo(dateStr: string, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return t("time.justNow");
	if (mins < 60) return t("time.minutesAgo", { n: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return t("time.hoursAgo", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 30) return t("time.daysAgo", { n: days });
	return new Date(dateStr).toLocaleDateString();
}

export function DiscussionPanel({ sessionId }: { sessionId?: string | null }) {
	const [data, setData] = useState<DiscussionData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { t } = useI18n();

	const fetchDiscussion = useCallback(async () => {
		if (!sessionId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/discussion`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({})) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			const json = await res.json() as DiscussionData;
			setData(json);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		setData(null);
		setError(null);
		fetchDiscussion();
	}, [fetchDiscussion]);

	if (!sessionId) {
		return (
			<div className="flex flex-col items-center justify-center py-20">
				<p className="text-sm text-muted-foreground/50">{t("discussion.noSession")}</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-20 gap-2">
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
				<span className="text-sm text-muted-foreground/50">{t("discussion.loadingDiscussion")}</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-3">
				<div className="flex items-center gap-2 text-destructive">
					<AlertCircle className="h-3.5 w-3.5" />
				<p className="text-sm">{error}</p>
			</div>
			<button
				type="button"
				onClick={fetchDiscussion}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
				>
					<RefreshCw className="h-3 w-3" />
					{t("common.retry")}
				</button>
			</div>
		);
	}

	if (!data) return null;

	const hasBody = data.body.trim().length > 0;
	const hasComments = data.comments.length > 0;

	return (
		<div className="pt-5 space-y-6">
			{hasBody && (
				<div>
				<div className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-3">
					{t("discussion.description")}
				</div>
				<div className="text-sm">
					<Markdown>{data.body}</Markdown>
				</div>
				</div>
			)}

			{!hasBody && !hasComments && (
				<div className="text-center py-12">
					<p className="text-sm text-muted-foreground/40">{t("discussion.noContent")}</p>
				</div>
			)}

			{hasComments && (
				<div>
				<div className="text-xs font-medium text-muted-foreground/40 uppercase tracking-wider mb-3">
					{t("discussion.comments")}
					<span className="ml-1.5 text-muted-foreground/25">{data.comments.length}</span>
				</div>
					<div className="space-y-0">
						{data.comments.map((comment, i) => (
							<div
								key={comment.id}
								className={`py-4 ${i > 0 ? "border-t border-border/50" : ""}`}
							>
								<div className="flex items-center gap-2 mb-2.5">
									{comment.author_avatar ? (
										<img
											src={comment.author_avatar}
											alt={comment.author}
											className="h-5 w-5 rounded-full"
										/>
									) : (
										<div className="h-5 w-5 rounded-full bg-muted" />
									)}
								<span className="text-sm font-medium">{comment.author}</span>
								<span className="text-xs text-muted-foreground/40">
										{timeAgo(comment.created_at, t)}
									</span>
									<a
										href={comment.html_url}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-auto text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
									>
										<ExternalLink className="h-3 w-3" />
									</a>
								</div>
							<div className="pl-7 text-sm">
								<Markdown>{comment.body}</Markdown>
							</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
