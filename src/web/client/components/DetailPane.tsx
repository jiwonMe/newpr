import { useState, useEffect, useCallback } from "react";
import { Layers, FileText, Plus, Pencil, Trash2, ArrowRight, X, Loader2 } from "lucide-react";
import type { FileGroup, FileChange, FileStatus } from "../../../types/output.ts";
import { DiffViewer } from "./DiffViewer.tsx";

export interface DetailTarget {
	kind: "group" | "file";
	group?: FileGroup;
	file?: FileChange;
	files: FileChange[];
}

const STATUS_ICON: Record<FileStatus, typeof Plus> = {
	added: Plus,
	modified: Pencil,
	deleted: Trash2,
	renamed: ArrowRight,
};

const STATUS_COLOR: Record<FileStatus, string> = {
	added: "text-green-500",
	modified: "text-yellow-500",
	deleted: "text-red-500",
	renamed: "text-blue-500",
};

const TYPE_COLORS: Record<string, string> = {
	feature: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	refactor: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
	bugfix: "bg-red-500/10 text-red-600 dark:text-red-400",
	chore: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
	docs: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
	test: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
	config: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export function resolveDetail(
	kind: "group" | "file",
	id: string,
	groups: FileGroup[],
	files: FileChange[],
): DetailTarget | null {
	if (kind === "group") {
		const group = groups.find((g) => g.name === id);
		if (!group) return null;
		const groupFiles = files.filter((f) => group.files.includes(f.path));
		return { kind: "group", group, files: groupFiles };
	}
	const file = files.find((f) => f.path === id);
	if (!file) return null;
	return { kind: "file", file, files: [file] };
}

function usePatchFetcher(sessionId: string | null | undefined, filePath: string | undefined) {
	const [patch, setPatch] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setPatch(null);
		setError(null);
		setLoading(false);
	}, [sessionId, filePath]);

	const fetchPatch = useCallback(async () => {
		if (!sessionId || !filePath) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/diff?path=${encodeURIComponent(filePath)}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: "Failed to load diff" }));
				throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
			}
			const data = await res.json() as { patch: string };
			setPatch(data.patch);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [sessionId, filePath]);

	return { patch, loading, error, fetchPatch };
}

function FileDetail({
	file,
	sessionId,
	prUrl,
	onClose,
}: {
	file: FileChange;
	sessionId?: string | null;
	prUrl?: string;
	onClose?: () => void;
}) {
	const Icon = STATUS_ICON[file.status];
	const { patch, loading, error, fetchPatch } = usePatchFetcher(sessionId, file.path);

	useEffect(() => {
		if (sessionId && !patch && !loading && !error) {
			fetchPatch();
		}
	}, [sessionId, patch, loading, error, fetchPatch]);

	return (
		<div className="p-4 space-y-4">
			<div className="flex items-start justify-between gap-2">
				<div className="space-y-2 min-w-0">
					<div className="flex items-center gap-2 min-w-0">
						<FileText className="h-4 w-4 text-muted-foreground shrink-0" />
						<span className="text-sm font-mono font-medium break-all">{file.path}</span>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-1.5">
							<Icon className={`h-3 w-3 ${STATUS_COLOR[file.status]}`} />
							<span className="text-xs text-muted-foreground">{file.status}</span>
						</div>
						<span className="text-xs text-green-500">+{file.additions}</span>
						<span className="text-xs text-red-500">−{file.deletions}</span>
					</div>
				</div>
				{onClose && (
					<button type="button" onClick={onClose} className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
						<X className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			{loading && (
				<div className="flex items-center justify-center py-8">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
					<span className="text-xs text-muted-foreground ml-2">Loading diff...</span>
				</div>
			)}
			{error && (
				<div className="text-center py-6 space-y-2">
					<p className="text-xs text-red-500">{error}</p>
					<button
						type="button"
						onClick={fetchPatch}
						className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
					>
						Retry
					</button>
				</div>
			)}
			{patch && (
				<DiffViewer
					patch={patch}
					filePath={file.path}
					sessionId={sessionId}
					githubUrl={prUrl ? `${prUrl}/files` : undefined}
				/>
			)}
		</div>
	);
}

export function DetailPane({
	target,
	sessionId,
	prUrl,
	onClose,
}: {
	target: DetailTarget | null;
	sessionId?: string | null;
	prUrl?: string;
	onClose?: () => void;
}) {
	if (!target) return null;

	if (target.kind === "group" && target.group) {
		const g = target.group;
		return (
			<div className="p-4 space-y-4">
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-2 min-w-0">
						<div className="flex items-center gap-2">
							<Layers className="h-4 w-4 text-muted-foreground shrink-0" />
							<h4 className="text-sm font-semibold break-words">{g.name}</h4>
						</div>
						<span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[g.type] ?? TYPE_COLORS.chore}`}>
							{g.type}
						</span>
					</div>
					{onClose && (
						<button type="button" onClick={onClose} className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
				<p className="text-sm text-muted-foreground leading-relaxed break-words">{g.description}</p>
				<div className="border-t pt-3">
					<div className="text-xs text-muted-foreground mb-2">{target.files.length} files</div>
					<div className="space-y-2">
						{target.files.map((f) => {
							const Icon = STATUS_ICON[f.status];
							return (
								<div key={f.path} className="space-y-1">
									<div className="flex items-center gap-2 min-w-0">
										<Icon className={`h-3 w-3 shrink-0 ${STATUS_COLOR[f.status]}`} />
										<span className="text-xs font-mono truncate" title={f.path}>{f.path}</span>
										<span className="text-xs text-green-500 shrink-0">+{f.additions}</span>
										<span className="text-xs text-red-500 shrink-0">−{f.deletions}</span>
									</div>
									<p className="text-xs text-muted-foreground pl-5 break-words">{f.summary}</p>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		);
	}

	if (target.kind === "file" && target.file) {
		return <FileDetail file={target.file} sessionId={sessionId} prUrl={prUrl} onClose={onClose} />;
	}

	return null;
}
