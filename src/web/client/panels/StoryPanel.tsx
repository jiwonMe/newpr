import { useState, useMemo } from "react";
import { Layers, FileText, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import type { NewprOutput, FileGroup, FileChange, FileStatus } from "../../../types/output.ts";

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

interface DetailTarget {
	kind: "group" | "file";
	group?: FileGroup;
	file?: FileChange;
	files: FileChange[];
}

function resolveDetail(
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

function renderClickableInline(
	text: string,
	onAnchorClick: (kind: "group" | "file", id: string) => void,
	activeId: string | null,
): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const regex = /\[\[(group|file):([^\]]+)\]\]|`([^`]+)`/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		if (match[1] === "group") {
			const id = match[2]!;
			const isActive = activeId === `group:${id}`;
			parts.push(
				<button
					key={match.index}
					type="button"
					onClick={(e) => { e.stopPropagation(); onAnchorClick("group", id); }}
					className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
						isActive
							? "bg-blue-500/20 text-blue-500 dark:text-blue-300 ring-1 ring-blue-500/40"
							: "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
					}`}
				>
					{id}
				</button>,
			);
		} else if (match[1] === "file") {
			const id = match[2]!;
			const isActive = activeId === `file:${id}`;
			parts.push(
				<button
					key={match.index}
					type="button"
					onClick={(e) => { e.stopPropagation(); onAnchorClick("file", id); }}
					className={`inline px-1.5 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer ${
						isActive
							? "bg-muted ring-1 ring-foreground/20 text-foreground"
							: "bg-muted text-muted-foreground hover:text-foreground"
					}`}
				>
					{id.split("/").pop()}
				</button>,
			);
		} else if (match[3]) {
			parts.push(
				<code key={match.index} className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
					{match[3]}
				</code>,
			);
		}
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

function DetailPane({ target }: { target: DetailTarget | null }) {
	if (!target) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
				<div className="text-muted-foreground/40 mb-2">
					<Layers className="h-8 w-8 mx-auto" />
				</div>
				<p className="text-sm text-muted-foreground/60">
					Click a group or file link in the narrative to see details
				</p>
			</div>
		);
	}

	if (target.kind === "group" && target.group) {
		const g = target.group;
		return (
			<div className="p-4 space-y-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Layers className="h-4 w-4 text-muted-foreground shrink-0" />
						<h4 className="text-sm font-semibold truncate">{g.name}</h4>
					</div>
					<span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[g.type] ?? TYPE_COLORS.chore}`}>
						{g.type}
					</span>
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
		const f = target.file;
		const Icon = STATUS_ICON[f.status];
		return (
			<div className="p-4 space-y-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2 min-w-0">
						<FileText className="h-4 w-4 text-muted-foreground shrink-0" />
						<span className="text-sm font-mono font-medium truncate" title={f.path}>{f.path}</span>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-1.5">
							<Icon className={`h-3 w-3 ${STATUS_COLOR[f.status]}`} />
							<span className="text-xs text-muted-foreground">{f.status}</span>
						</div>
						<span className="text-xs text-green-500">+{f.additions}</span>
						<span className="text-xs text-red-500">−{f.deletions}</span>
					</div>
				</div>
				<p className="text-sm text-muted-foreground leading-relaxed break-words">{f.summary}</p>
				{f.groups.length > 0 && (
					<div className="border-t pt-3">
						<div className="text-xs text-muted-foreground mb-2">Groups</div>
						<div className="flex flex-wrap gap-1.5">
							{f.groups.map((g) => (
								<span key={g} className="text-xs bg-muted px-2 py-0.5 rounded-full">{g}</span>
							))}
						</div>
					</div>
				)}
			</div>
		);
	}

	return null;
}

export function StoryPanel({ data }: { data: NewprOutput }) {
	const { summary, groups, files, narrative } = data;
	const [activeId, setActiveId] = useState<string | null>(null);

	const detailTarget = useMemo(() => {
		if (!activeId) return null;
		const [kind, ...rest] = activeId.split(":");
		const id = rest.join(":");
		return resolveDetail(kind as "group" | "file", id, groups, files);
	}, [activeId, groups, files]);

	function handleAnchorClick(kind: "group" | "file", id: string) {
		const key = `${kind}:${id}`;
		setActiveId((prev) => prev === key ? null : key);
	}

	const narrativeLines = narrative.split("\n");

	return (
		<div className="space-y-4 pt-4">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Overview</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-sm leading-relaxed">{summary.purpose}</p>
					<div className="flex flex-wrap gap-2">
						{groups.map((g) => (
							<button
								key={g.name}
								type="button"
								onClick={() => handleAnchorClick("group", g.name)}
								className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
									activeId === `group:${g.name}`
										? "bg-blue-500/20 text-blue-500 dark:text-blue-300 ring-1 ring-blue-500/40"
										: "bg-muted hover:bg-muted/80"
								}`}
							>
								{g.name}
							</button>
						))}
					</div>
				</CardContent>
			</Card>

			<div className="grid grid-cols-2 gap-4">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm text-muted-foreground">Scope</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm">{summary.scope}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm text-muted-foreground">Impact</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm">{summary.impact}</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-[1fr_320px] gap-4">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm">Narrative</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{narrativeLines.map((line, i) => {
							if (!line.trim()) return null;
							if (line.startsWith("# ")) {
								return <h1 key={i} className="text-lg font-bold mt-4 mb-2 break-words">{line.slice(2)}</h1>;
							}
							if (line.startsWith("## ")) {
								return <h2 key={i} className="text-base font-semibold mt-4 mb-1 break-words">{line.slice(3)}</h2>;
							}
							if (line.startsWith("### ")) {
								return <h3 key={i} className="text-sm font-medium mt-3 mb-1 break-words">{line.slice(4)}</h3>;
							}
							if (line.startsWith("- ")) {
								return (
									<li key={i} className="text-sm text-muted-foreground ml-4 break-words leading-relaxed">
										{renderClickableInline(line.slice(2), handleAnchorClick, activeId)}
									</li>
								);
							}
							return (
								<p key={i} className="text-sm leading-relaxed text-foreground/90 break-words">
									{renderClickableInline(line, handleAnchorClick, activeId)}
								</p>
							);
						})}
					</CardContent>
				</Card>

				<div className="sticky top-4 self-start">
					<Card className="max-h-[calc(100vh-200px)] overflow-y-auto">
						<DetailPane target={detailTarget} />
					</Card>
				</div>
			</div>
		</div>
	);
}
