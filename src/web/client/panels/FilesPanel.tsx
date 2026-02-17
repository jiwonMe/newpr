import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowRight, FolderTree, Layers, ArrowDownWideNarrow, Folder, FolderOpen } from "lucide-react";
import type { FileChange, FileGroup, FileStatus } from "../../../types/output.ts";

type ViewMode = "tree" | "group" | "changes";

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

interface TreeNode {
	name: string;
	fullPath: string;
	file?: FileChange;
	children: Map<string, TreeNode>;
}

function buildTree(files: FileChange[]): TreeNode {
	const root: TreeNode = { name: "", fullPath: "", children: new Map() };
	for (const file of files) {
		const parts = file.path.split("/");
		let node = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			const fullPath = parts.slice(0, i + 1).join("/");
			if (!node.children.has(part)) {
				node.children.set(part, { name: part, fullPath, children: new Map() });
			}
			node = node.children.get(part)!;
		}
		node.file = file;
	}
	return root;
}

function collapseTree(node: TreeNode): TreeNode {
	if (!node.file && node.children.size === 1) {
		const [childName, child] = [...node.children.entries()][0]!;
		const collapsed = collapseTree(child);
		const mergedName = node.name ? `${node.name}/${childName}` : childName;
		return { ...collapsed, name: mergedName };
	}
	const children = new Map<string, TreeNode>();
	for (const [key, child] of node.children) {
		children.set(key, collapseTree(child));
	}
	return { ...node, children };
}

function FileRow({
	file,
	selectedPath,
	onFileSelect,
	expanded,
	onToggleExpand,
	indent,
	showFullPath,
}: {
	file: FileChange;
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
	expanded: Set<string>;
	onToggleExpand: (e: React.MouseEvent, path: string) => void;
	indent?: number;
	showFullPath?: boolean;
}) {
	const Icon = STATUS_ICON[file.status];
	const open = expanded.has(file.path);
	const isSelected = selectedPath === file.path;
	const lastSlash = file.path.lastIndexOf("/");
	const dir = showFullPath && lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : "";
	const name = showFullPath && lastSlash >= 0 ? file.path.slice(lastSlash + 1) : (showFullPath ? file.path : file.path.split("/").pop()!);

	return (
		<div>
			<div
				role="button"
				tabIndex={0}
				onClick={() => onFileSelect?.(file.path)}
				onKeyDown={(e) => { if (e.key === "Enter") onFileSelect?.(file.path); }}
				style={indent ? { paddingLeft: `${indent * 14 + 2}px` } : undefined}
				className={`w-full flex items-center gap-1.5 py-1 text-left hover:bg-accent/30 transition-colors min-w-0 pr-1 rounded cursor-pointer ${
					isSelected ? "bg-accent/40 ring-1 ring-accent" : ""
				}`}
			>
				<button
					type="button"
					onClick={(e) => onToggleExpand(e, file.path)}
					className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-accent/50 transition-colors"
				>
					{open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
				</button>
				<Icon className={`h-3 w-3 shrink-0 ${STATUS_COLOR[file.status]}`} />
				<span className="flex-1 min-w-0 flex items-baseline overflow-hidden" title={file.path}>
					{dir && <span className="text-[11px] text-muted-foreground/50 font-mono truncate shrink">{dir}</span>}
					<span className="text-xs font-mono font-medium shrink-0">{name}</span>
				</span>
				<span className="text-[11px] tabular-nums text-green-500 shrink-0 w-8 text-right">+{file.additions}</span>
				<span className="text-[11px] tabular-nums text-red-500 shrink-0 w-8 text-right">−{file.deletions}</span>
			</div>
			{open && (
				<div className="pb-1.5" style={{ paddingLeft: `${(indent ?? 0) * 14 + 36}px` }}>
					<p className="text-[11px] text-muted-foreground leading-relaxed break-words">{file.summary}</p>
					{file.groups.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-1">
							{file.groups.map((g) => (
								<span key={g} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{g}</span>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function TreeView({
	node,
	files,
	selectedPath,
	onFileSelect,
	expanded,
	onToggleExpand,
	folderOpen,
	onToggleFolder,
	depth,
}: {
	node: TreeNode;
	files: FileChange[];
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
	expanded: Set<string>;
	onToggleExpand: (e: React.MouseEvent, path: string) => void;
	folderOpen: Set<string>;
	onToggleFolder: (path: string) => void;
	depth: number;
}) {
	const dirs: TreeNode[] = [];
	const leaves: TreeNode[] = [];
	for (const child of node.children.values()) {
		if (child.file && child.children.size === 0) {
			leaves.push(child);
		} else {
			dirs.push(child);
		}
	}
	dirs.sort((a, b) => a.name.localeCompare(b.name));
	leaves.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<>
			{dirs.map((dir) => {
				const isOpen = folderOpen.has(dir.fullPath);
				const FolderIcon = isOpen ? FolderOpen : Folder;
				return (
					<div key={dir.fullPath}>
						<div
							role="button"
							tabIndex={0}
							onClick={() => onToggleFolder(dir.fullPath)}
							onKeyDown={(e) => { if (e.key === "Enter") onToggleFolder(dir.fullPath); }}
							style={{ paddingLeft: `${depth * 14 + 2}px` }}
							className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-accent/30 rounded transition-colors"
						>
							{isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
							<FolderIcon className="h-3 w-3 text-muted-foreground/70 shrink-0" />
							<span className="text-xs font-mono text-muted-foreground">{dir.name}</span>
						</div>
						{isOpen && (
							<TreeView
								node={dir}
								files={files}
								selectedPath={selectedPath}
								onFileSelect={onFileSelect}
								expanded={expanded}
								onToggleExpand={onToggleExpand}
								folderOpen={folderOpen}
								onToggleFolder={onToggleFolder}
								depth={depth + 1}
							/>
						)}
					</div>
				);
			})}
			{leaves.map((leaf) => (
				<FileRow
					key={leaf.fullPath}
					file={leaf.file!}
					selectedPath={selectedPath}
					onFileSelect={onFileSelect}
					expanded={expanded}
					onToggleExpand={onToggleExpand}
					indent={depth}
				/>
			))}
		</>
	);
}

function GroupView({
	files,
	groups,
	selectedPath,
	onFileSelect,
	expanded,
	onToggleExpand,
}: {
	files: FileChange[];
	groups: FileGroup[];
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
	expanded: Set<string>;
	onToggleExpand: (e: React.MouseEvent, path: string) => void;
}) {
	const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(groups.map((g) => g.name)));

	const filesByGroup = useMemo(() => {
		const map = new Map<string, FileChange[]>();
		const fileMap = new Map(files.map((f) => [f.path, f]));
		for (const g of groups) {
			map.set(g.name, g.files.map((p) => fileMap.get(p)).filter(Boolean) as FileChange[]);
		}
		const grouped = new Set(groups.flatMap((g) => g.files));
		const ungrouped = files.filter((f) => !grouped.has(f.path));
		if (ungrouped.length > 0) map.set("_ungrouped", ungrouped);
		return map;
	}, [files, groups]);

	const groupMeta = useMemo(() => {
		const map = new Map<string, FileGroup>();
		for (const g of groups) map.set(g.name, g);
		return map;
	}, [groups]);

	function toggleGroup(name: string) {
		setOpenGroups((s) => {
			const next = new Set(s);
			next.has(name) ? next.delete(name) : next.add(name);
			return next;
		});
	}

	return (
		<div className="space-y-1">
			{[...filesByGroup.entries()].map(([groupName, groupFiles]) => {
				const isOpen = openGroups.has(groupName);
				const meta = groupMeta.get(groupName);
				const displayName = groupName === "_ungrouped" ? "Ungrouped" : groupName;
				const totalAdd = groupFiles.reduce((s, f) => s + f.additions, 0);
				const totalDel = groupFiles.reduce((s, f) => s + f.deletions, 0);

				return (
					<div key={groupName}>
						<div
							role="button"
							tabIndex={0}
							onClick={() => toggleGroup(groupName)}
							onKeyDown={(e) => { if (e.key === "Enter") toggleGroup(groupName); }}
							className="flex items-center gap-1.5 py-1 px-1 cursor-pointer hover:bg-accent/30 rounded transition-colors"
						>
							{isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
							<span className="text-xs font-medium flex-1 min-w-0 truncate">{displayName}</span>
							<span className="text-[11px] text-muted-foreground shrink-0">{groupFiles.length} files</span>
							<span className="text-[11px] tabular-nums text-green-500 shrink-0 w-8 text-right">+{totalAdd}</span>
							<span className="text-[11px] tabular-nums text-red-500 shrink-0 w-8 text-right">−{totalDel}</span>
						</div>
						{isOpen && (
							<div>
								{meta?.description && (
									<p className="text-[11px] text-muted-foreground pl-6 pb-1 leading-relaxed">{meta.description}</p>
								)}
								<div className="pl-3">
									{groupFiles.map((file) => (
										<FileRow
											key={file.path}
											file={file}
											selectedPath={selectedPath}
											onFileSelect={onFileSelect}
											expanded={expanded}
											onToggleExpand={onToggleExpand}
											showFullPath
										/>
									))}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ChangesView({
	files,
	selectedPath,
	onFileSelect,
	expanded,
	onToggleExpand,
}: {
	files: FileChange[];
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
	expanded: Set<string>;
	onToggleExpand: (e: React.MouseEvent, path: string) => void;
}) {
	const sorted = useMemo(
		() => [...files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)),
		[files],
	);

	const maxChanges = sorted.length > 0 ? sorted[0]!.additions + sorted[0]!.deletions : 1;

	return (
		<div className="divide-y divide-border/30">
			{sorted.map((file) => {
				const total = file.additions + file.deletions;
				const addPct = total > 0 ? (file.additions / total) * 100 : 0;
				const barWidth = (total / maxChanges) * 100;

				return (
					<div key={file.path}>
						<FileRow
							file={file}
							selectedPath={selectedPath}
							onFileSelect={onFileSelect}
							expanded={expanded}
							onToggleExpand={onToggleExpand}
							showFullPath
						/>
						<div className="h-1 rounded-full bg-muted overflow-hidden mx-1 -mt-0.5 mb-1" style={{ width: `${barWidth}%` }}>
							<div className="h-full bg-green-500/60 float-left" style={{ width: `${addPct}%` }} />
							<div className="h-full bg-red-500/60 float-left" style={{ width: `${100 - addPct}%` }} />
						</div>
					</div>
				);
			})}
		</div>
	);
}

const VIEW_MODES: { value: ViewMode; icon: typeof FolderTree; label: string }[] = [
	{ value: "tree", icon: FolderTree, label: "Tree" },
	{ value: "group", icon: Layers, label: "Groups" },
	{ value: "changes", icon: ArrowDownWideNarrow, label: "Changes" },
];

export function FilesPanel({
	files,
	groups,
	selectedPath,
	onFileSelect,
}: {
	files: FileChange[];
	groups?: FileGroup[];
	selectedPath?: string | null;
	onFileSelect?: (path: string) => void;
}) {
	const [viewMode, setViewMode] = useState<ViewMode>("tree");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [folderOpen, setFolderOpen] = useState<Set<string>>(() => {
		const dirs = new Set<string>();
		for (const f of files) {
			const parts = f.path.split("/");
			for (let i = 1; i < parts.length; i++) {
				dirs.add(parts.slice(0, i).join("/"));
			}
		}
		return dirs;
	});

	const tree = useMemo(() => collapseTree(buildTree(files)), [files]);

	function toggleExpand(e: React.MouseEvent, path: string) {
		e.stopPropagation();
		setExpanded((s) => {
			const next = new Set(s);
			next.has(path) ? next.delete(path) : next.add(path);
			return next;
		});
	}

	function toggleFolder(path: string) {
		setFolderOpen((s) => {
			const next = new Set(s);
			next.has(path) ? next.delete(path) : next.add(path);
			return next;
		});
	}

	return (
		<div className="pt-4">
			<div className="flex items-center justify-between mb-3">
				<span className="text-xs text-muted-foreground">{files.length} files changed</span>
				<div className="flex items-center rounded-md bg-muted p-0.5 gap-0.5">
					{VIEW_MODES.map(({ value, icon: ModeIcon, label }) => (
						<button
							key={value}
							type="button"
							onClick={() => setViewMode(value)}
							title={label}
							className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
								viewMode === value
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<ModeIcon className="h-3 w-3" />
							<span className="hidden sm:inline">{label}</span>
						</button>
					))}
				</div>
			</div>

			{viewMode === "tree" && (
				<TreeView
					node={tree}
					files={files}
					selectedPath={selectedPath}
					onFileSelect={onFileSelect}
					expanded={expanded}
					onToggleExpand={toggleExpand}
					folderOpen={folderOpen}
					onToggleFolder={toggleFolder}
					depth={0}
				/>
			)}

			{viewMode === "group" && (
				<GroupView
					files={files}
					groups={groups ?? []}
					selectedPath={selectedPath}
					onFileSelect={onFileSelect}
					expanded={expanded}
					onToggleExpand={toggleExpand}
				/>
			)}

			{viewMode === "changes" && (
				<ChangesView
					files={files}
					selectedPath={selectedPath}
					onFileSelect={onFileSelect}
					expanded={expanded}
					onToggleExpand={toggleExpand}
				/>
			)}
		</div>
	);
}
