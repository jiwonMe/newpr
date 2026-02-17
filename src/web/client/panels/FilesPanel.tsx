import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import type { FileChange, FileStatus } from "../../../types/output.ts";

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

function splitPath(fullPath: string): { dir: string; name: string } {
	const lastSlash = fullPath.lastIndexOf("/");
	if (lastSlash === -1) return { dir: "", name: fullPath };
	return { dir: fullPath.slice(0, lastSlash + 1), name: fullPath.slice(lastSlash + 1) };
}

export function FilesPanel({
	files,
	selectedPath,
	onFileSelect,
}: {
	files: FileChange[];
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
}) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	function toggleExpand(e: React.MouseEvent, path: string) {
		e.stopPropagation();
		setExpanded((s) => {
			const next = new Set(s);
			next.has(path) ? next.delete(path) : next.add(path);
			return next;
		});
	}

	function handleRowClick(path: string) {
		onFileSelect?.(path);
	}

	return (
		<div className="pt-6">
			<div className="text-xs text-muted-foreground mb-3">
				{files.length} files changed
			</div>
			<div className="divide-y">
				{files.map((file) => {
					const Icon = STATUS_ICON[file.status];
					const open = expanded.has(file.path);
					const isSelected = selectedPath === file.path;
					const { dir, name } = splitPath(file.path);

					return (
						<div key={file.path}>
							<div
								role="button"
								tabIndex={0}
								onClick={() => handleRowClick(file.path)}
								onKeyDown={(e) => { if (e.key === "Enter") handleRowClick(file.path); }}
								className={`w-full flex items-center gap-3 py-2.5 text-left hover:bg-accent/30 transition-colors min-w-0 -mx-1 px-1 rounded cursor-pointer ${
									isSelected ? "bg-accent/40 ring-1 ring-accent" : ""
								}`}
							>
								<button
									type="button"
									onClick={(e) => toggleExpand(e, file.path)}
									className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-accent/50 transition-colors"
								>
									{open ? (
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
									) : (
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
									)}
								</button>
								<Icon className={`h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[file.status]}`} />
								<span className="flex-1 min-w-0 flex items-baseline overflow-hidden" title={file.path}>
									<span className="text-xs text-muted-foreground/50 font-mono truncate shrink">{dir}</span>
									<span className="text-sm font-mono font-medium shrink-0">{name}</span>
								</span>
								<span className="text-xs tabular-nums text-green-500 shrink-0 w-10 text-right">+{file.additions}</span>
								<span className="text-xs tabular-nums text-red-500 shrink-0 w-10 text-right">−{file.deletions}</span>
							</div>
							{open && (
								<div className="pb-3 pl-12">
									<p className="text-xs text-muted-foreground leading-relaxed break-words">{file.summary}</p>
									{file.groups.length > 0 && (
										<div className="flex flex-wrap gap-1.5 mt-2">
											{file.groups.map((g) => (
												<span key={g} className="text-[11px] bg-muted px-2 py-0.5 rounded-full">{g}</span>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
