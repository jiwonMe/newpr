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

export function FilesPanel({ files }: { files: FileChange[] }) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	function toggle(path: string) {
		setExpanded((s) => {
			const next = new Set(s);
			next.has(path) ? next.delete(path) : next.add(path);
			return next;
		});
	}

	return (
		<div className="pt-4">
			<div className="text-xs text-muted-foreground mb-3">
				{files.length} files changed
			</div>
			<div className="border rounded-lg divide-y">
				{files.map((file) => {
					const Icon = STATUS_ICON[file.status];
					const open = expanded.has(file.path);

					return (
						<div key={file.path}>
							<button
								type="button"
								onClick={() => toggle(file.path)}
								className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
							>
								{open ? (
									<ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								) : (
									<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								)}
								<Icon className={`h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[file.status]}`} />
								<span className="text-sm font-mono flex-1 truncate">{file.path}</span>
								<span className="text-xs text-green-500 shrink-0">+{file.additions}</span>
								<span className="text-xs text-red-500 shrink-0">−{file.deletions}</span>
							</button>
							{open && (
								<div className="px-4 pb-3 pl-14">
									<p className="text-sm text-muted-foreground">{file.summary}</p>
									{file.groups.length > 0 && (
										<div className="flex gap-1.5 mt-2">
											{file.groups.map((g) => (
												<span key={g} className="text-xs bg-muted px-2 py-0.5 rounded-full">{g}</span>
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
