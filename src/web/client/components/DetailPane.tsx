import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ArrowRight, X, Loader2, AlertCircle } from "lucide-react";
import type { FileGroup, FileChange, FileStatus } from "../../../types/output.ts";
import { DiffViewer } from "./DiffViewer.tsx";

export interface DetailTarget {
	kind: "group" | "file" | "line";
	group?: FileGroup;
	file?: FileChange;
	files: FileChange[];
	scrollToLine?: number;
	scrollToLineEnd?: number;
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

const TYPE_DOT: Record<string, string> = {
	feature: "bg-blue-500",
	refactor: "bg-purple-500",
	bugfix: "bg-red-500",
	chore: "bg-neutral-400",
	docs: "bg-teal-500",
	test: "bg-yellow-500",
	config: "bg-orange-500",
};

export function resolveDetail(
	kind: "group" | "file" | "line",
	id: string,
	groups: FileGroup[],
	files: FileChange[],
): DetailTarget | null {
	if (kind === "group") {
		const cleanId = id.replace(/\s*\([^)]*\)\s*$/, "").trim();
		const group = groups.find((g) => g.name === id || g.name === cleanId || g.name.toLowerCase() === cleanId.toLowerCase());
		if (!group) return null;
		const groupFiles = files.filter((f) => group.files.includes(f.path));
		return { kind: "group", group, files: groupFiles };
	}
	if (kind === "line") {
		const hashIdx = id.indexOf("#");
		if (hashIdx < 0) return null;
		const filePath = id.slice(0, hashIdx);
		const lineRef = id.slice(hashIdx + 1);
		const rangeMatch = lineRef.match(/^L(\d+)(?:-L?(\d+))?/);
		const lineNum = rangeMatch ? Number.parseInt(rangeMatch[1]!, 10) : undefined;
		const lineEnd = rangeMatch?.[2] ? Number.parseInt(rangeMatch[2]!, 10) : undefined;
		const file = files.find((f) => f.path === filePath);
		if (!file) return null;
		return { kind: "line", file, files: [file], scrollToLine: lineNum, scrollToLineEnd: lineEnd };
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
	scrollToLine,
	scrollToLineEnd,
}: {
	file: FileChange;
	sessionId?: string | null;
	prUrl?: string;
	onClose?: () => void;
	scrollToLine?: number;
	scrollToLineEnd?: number;
}) {
	const Icon = STATUS_ICON[file.status];
	const { patch, loading, error, fetchPatch } = usePatchFetcher(sessionId, file.path);

	useEffect(() => {
		if (sessionId && !patch && !loading && !error) {
			fetchPatch();
		}
	}, [sessionId, patch, loading, error, fetchPatch]);

	return (
		<div className="flex flex-col h-full">
			<div className="shrink-0 flex items-center justify-between gap-2 px-4 h-12 border-b">
				<div className="flex items-center gap-2 min-w-0">
					<Icon className={`h-3 w-3 shrink-0 ${STATUS_COLOR[file.status]}`} />
					<span className="text-[11px] font-mono truncate" title={file.path}>{file.path}</span>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<span className="text-[10px] tabular-nums text-green-600 dark:text-green-400">+{file.additions}</span>
					<span className="text-[10px] tabular-nums text-red-600 dark:text-red-400">-{file.deletions}</span>
					{onClose && (
						<button type="button" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors">
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{loading && (
					<div className="flex items-center justify-center py-16 gap-2">
						<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
						<span className="text-xs text-muted-foreground/50">Loading diff</span>
					</div>
				)}
				{error && (
					<div className="flex flex-col items-center justify-center py-16 gap-3">
						<div className="flex items-center gap-2 text-destructive">
							<AlertCircle className="h-3.5 w-3.5" />
							<p className="text-xs">{error}</p>
						</div>
						<button
							type="button"
							onClick={fetchPatch}
							className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
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
						scrollToLine={scrollToLine}
						scrollToLineEnd={scrollToLineEnd}
					/>
				)}
			</div>
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
		const totalAdd = target.files.reduce((s, f) => s + f.additions, 0);
		const totalDel = target.files.reduce((s, f) => s + f.deletions, 0);

		return (
			<div className="flex flex-col h-full">
				<div className="shrink-0 flex items-center justify-between gap-2 px-4 h-12 border-b">
					<div className="flex items-center gap-2 min-w-0">
						<span className={`h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[g.type] ?? TYPE_DOT.chore}`} />
						<span className="text-xs font-medium truncate">{g.name}</span>
						<span className="text-[10px] text-muted-foreground/30">{g.type}</span>
					</div>
					{onClose && (
						<button type="button" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors">
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>

				<div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
					<p className="text-[11px] text-muted-foreground/60 leading-relaxed">{g.description}</p>

					{g.key_changes && g.key_changes.length > 0 && (
						<div>
							<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-2">Key Changes</div>
							<ul className="space-y-1.5">
								{g.key_changes.map((change, i) => (
									<li key={i} className="flex gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
										<span className="text-muted-foreground/25 shrink-0 mt-px">·</span>
										<span>{change}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{g.risk && (
						<div>
							<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-1.5">Risk</div>
							<p className="text-[11px] text-muted-foreground/60 leading-relaxed">{g.risk}</p>
						</div>
					)}

					{g.dependencies && g.dependencies.length > 0 && (
						<div>
							<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-1.5">Dependencies</div>
							<div className="flex flex-wrap gap-1.5">
								{g.dependencies.map((dep) => (
									<span key={dep} className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/60 text-muted-foreground/60">{dep}</span>
								))}
							</div>
						</div>
					)}

					<div>
						<div className="flex items-center gap-2 mb-2.5">
							<span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">{target.files.length} files</span>
							<span className="text-[10px] tabular-nums text-green-600 dark:text-green-400">+{totalAdd}</span>
							<span className="text-[10px] tabular-nums text-red-600 dark:text-red-400">-{totalDel}</span>
						</div>
						<div className="space-y-px">
							{target.files.map((f) => {
								const Icon = STATUS_ICON[f.status];
								return (
									<div key={f.path} className="py-2">
										<div className="flex items-center gap-2 min-w-0">
											<Icon className={`h-2.5 w-2.5 shrink-0 ${STATUS_COLOR[f.status]}`} />
											<span className="text-[11px] font-mono truncate flex-1" title={f.path}>{f.path}</span>
											<span className="text-[10px] tabular-nums text-green-600 dark:text-green-400 shrink-0">+{f.additions}</span>
											<span className="text-[10px] tabular-nums text-red-600 dark:text-red-400 shrink-0">-{f.deletions}</span>
										</div>
										<p className="text-[11px] text-muted-foreground/40 mt-1 pl-[18px] leading-relaxed">{f.summary}</p>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		);
	}

	if ((target.kind === "file" || target.kind === "line") && target.file) {
		return <FileDetail file={target.file} sessionId={sessionId} prUrl={prUrl} onClose={onClose} scrollToLine={target.scrollToLine} scrollToLineEnd={target.scrollToLineEnd} />;
	}

	return null;
}
