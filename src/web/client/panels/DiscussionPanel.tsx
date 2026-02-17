import { useState, useEffect, useCallback } from "react";
import { Markdown } from "../components/Markdown.tsx";
import { MessageSquare, RefreshCw, ExternalLink } from "lucide-react";
import type { PrComment } from "../../../types/github.ts";

interface DiscussionData {
	body: string;
	comments: PrComment[];
}

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(dateStr).toLocaleDateString();
}

export function DiscussionPanel({ sessionId }: { sessionId?: string | null }) {
	const [data, setData] = useState<DiscussionData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
				<MessageSquare className="h-8 w-8 mb-2 opacity-40" />
				<p className="text-sm">No session available</p>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-16">
				<div className="animate-spin h-5 w-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
				<span className="ml-3 text-sm text-muted-foreground">Loading discussion…</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-16 gap-3">
				<p className="text-sm text-destructive">{error}</p>
				<button
					type="button"
					onClick={fetchDiscussion}
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<RefreshCw className="h-3 w-3" />
					Retry
				</button>
			</div>
		);
	}

	if (!data) return null;

	const hasBody = data.body.trim().length > 0;
	const hasComments = data.comments.length > 0;

	return (
		<div className="space-y-6">
			<section>
				<h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Description</h2>
				{hasBody ? (
					<div className="rounded-lg border border-border bg-card p-4">
						<Markdown>{data.body}</Markdown>
					</div>
				) : (
					<p className="text-sm text-muted-foreground italic">No description provided.</p>
				)}
			</section>

			<section>
				<h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
					Comments
					{hasComments && (
						<span className="ml-2 text-xs font-normal text-muted-foreground/70">
							({data.comments.length})
						</span>
					)}
				</h2>
				{hasComments ? (
					<div className="space-y-3">
						{data.comments.map((comment) => (
							<div key={comment.id} className="rounded-lg border border-border bg-card">
								<div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
									{comment.author_avatar ? (
										<img
											src={comment.author_avatar}
											alt={comment.author}
											className="h-5 w-5 rounded-full"
										/>
									) : (
										<div className="h-5 w-5 rounded-full bg-muted-foreground/20" />
									)}
									<span className="text-xs font-medium">{comment.author}</span>
									<span className="text-xs text-muted-foreground">
										{timeAgo(comment.created_at)}
									</span>
									<a
										href={comment.html_url}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-auto text-muted-foreground/50 hover:text-muted-foreground transition-colors"
									>
										<ExternalLink className="h-3 w-3" />
									</a>
								</div>
								<div className="px-4 py-3">
									<Markdown>{comment.body}</Markdown>
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground italic">No comments yet.</p>
				)}
			</section>
		</div>
	);
}
