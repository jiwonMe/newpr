import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export interface AnchorItem {
	kind: "group" | "file";
	id: string;
	label: string;
}

export interface CommandItem {
	id: string;
	label: string;
	description: string;
}

interface SuggestionEntry {
	id: string;
	label: string;
	badge?: string;
	badgeClass?: string;
	description?: string;
	mono?: boolean;
}

interface TipTapEditorProps {
	content?: string;
	placeholder?: string;
	disabled?: boolean;
	autoFocus?: boolean;
	className?: string;
	onSubmit?: () => void;
	onChange?: (text: string) => void;
	submitOnEnter?: boolean;
	submitOnModEnter?: boolean;
	onEscape?: () => void;
	editorRef?: React.MutableRefObject<ReturnType<typeof useEditor> | null>;
	anchorItems?: AnchorItem[];
	commands?: CommandItem[];
}

function SuggestionList({
	items,
	command,
	selectedIndex,
	setSelectedIndex,
}: {
	items: SuggestionEntry[];
	command: (item: SuggestionEntry) => void;
	selectedIndex: number;
	setSelectedIndex: (i: number) => void;
}) {
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (items.length === 0) return null;

	return (
		<div
			ref={listRef}
			className="z-50 min-w-[200px] max-w-[340px] max-h-[200px] overflow-y-auto rounded-lg border bg-background shadow-lg py-1"
		>
			{items.map((item, i) => (
				<button
					key={item.id}
					type="button"
					onClick={() => command(item)}
					onMouseEnter={() => setSelectedIndex(i)}
					className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
						i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
					}`}
				>
					{item.badge && (
						<span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${item.badgeClass ?? "bg-muted text-muted-foreground"}`}>
							{item.badge}
						</span>
					)}
					<span className={`truncate text-xs ${item.mono ? "font-mono" : ""}`}>
						{item.label}
					</span>
					{item.description && (
						<span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
							{item.description}
						</span>
					)}
				</button>
			))}
		</div>
	);
}

interface SuggestionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SuggestionListWrapper = forwardRef<SuggestionListRef, SuggestionProps<SuggestionEntry>>(
	(props, ref) => {
		const [selectedIndex, setSelectedIndex] = useState(0);

		useEffect(() => {
			setSelectedIndex(0);
		}, [props.items]);

		useImperativeHandle(ref, () => ({
			onKeyDown: ({ event }: SuggestionKeyDownProps) => {
				if (event.key === "ArrowUp") {
					setSelectedIndex((i) => (i + props.items.length - 1) % props.items.length);
					return true;
				}
				if (event.key === "ArrowDown") {
					setSelectedIndex((i) => (i + 1) % props.items.length);
					return true;
				}
				if (event.key === "Enter") {
					const item = props.items[selectedIndex];
					if (item) props.command(item);
					return true;
				}
				if (event.key === "Escape") {
					return true;
				}
				return false;
			},
		}));

		return (
			<SuggestionList
				items={props.items}
				command={props.command}
				selectedIndex={selectedIndex}
				setSelectedIndex={setSelectedIndex}
			/>
		);
	},
);

function createSuggestionRender(suggestionOpenRef: React.MutableRefObject<boolean>) {
	return () => {
		let renderer: ReactRenderer<SuggestionListRef> | null = null;
		let popup: HTMLDivElement | null = null;

		const positionPopup = (rect: DOMRect | null) => {
			if (!rect || !popup) return;
			const menuHeight = popup.offsetHeight || 200;
			const spaceBelow = window.innerHeight - rect.bottom;
			const fitsBelow = spaceBelow > menuHeight + 8;
			popup.style.left = `${rect.left}px`;
			if (fitsBelow) {
				popup.style.top = `${rect.bottom + 4}px`;
				popup.style.bottom = "";
			} else {
				popup.style.top = "";
				popup.style.bottom = `${window.innerHeight - rect.top + 4}px`;
			}
		};

		return {
			onStart: (props: SuggestionProps<SuggestionEntry>) => {
				suggestionOpenRef.current = true;
				popup = document.createElement("div");
				popup.style.position = "fixed";
				popup.style.zIndex = "50";
				document.body.appendChild(popup);

				renderer = new ReactRenderer(SuggestionListWrapper, {
					props,
					editor: props.editor,
				});
				popup.appendChild(renderer.element);
				positionPopup(props.clientRect?.() ?? null);
			},
			onUpdate: (props: SuggestionProps<SuggestionEntry>) => {
				renderer?.updateProps(props);
				positionPopup(props.clientRect?.() ?? null);
			},
			onKeyDown: (props: SuggestionKeyDownProps) => {
				if (props.event.key === "Escape") {
					popup?.remove();
					renderer?.destroy();
					popup = null;
					renderer = null;
					suggestionOpenRef.current = false;
					return true;
				}
				return renderer?.ref?.onKeyDown(props) ?? false;
			},
			onExit: () => {
				popup?.remove();
				renderer?.destroy();
				popup = null;
				renderer = null;
				suggestionOpenRef.current = false;
			},
		};
	};
}

function getTextWithAnchors(editor: ReturnType<typeof useEditor>): string {
	if (!editor) return "";
	const doc = editor.state.doc;
	const parts: string[] = [];

	doc.descendants((node) => {
		if (node.type.name === "anchorMention") {
			const kind = node.attrs.kind ?? "file";
			const id = node.attrs.id ?? node.attrs.label ?? "";
			parts.push(`[[${kind}:${id}]]`);
			return false;
		}
		if (node.type.name === "slashCommand") {
			parts.push(`/${node.attrs.id ?? node.attrs.label ?? ""}`);
			return false;
		}
		if (node.isText) {
			parts.push(node.text ?? "");
		}
		if (node.type.name === "paragraph" && parts.length > 0) {
			const last = parts[parts.length - 1];
			if (last !== "\n") parts.push("\n");
		}
		return true;
	});

	return parts.join("").trim();
}

const AnchorMention = Mention.extend({ name: "anchorMention" });
const SlashCommand = Mention.extend({ name: "slashCommand" });

export function TipTapEditor({
	content,
	placeholder: placeholderText = "",
	disabled = false,
	autoFocus = false,
	className = "",
	onSubmit,
	onChange,
	submitOnEnter = false,
	submitOnModEnter = false,
	onEscape,
	editorRef,
	anchorItems,
	commands,
}: TipTapEditorProps) {
	const callbacksRef = useRef({ onSubmit, onChange, onEscape });
	callbacksRef.current = { onSubmit, onChange, onEscape };
	const anchorItemsRef = useRef(anchorItems);
	anchorItemsRef.current = anchorItems;
	const commandsRef = useRef(commands);
	commandsRef.current = commands;
	const suggestionOpenRef = useRef(false);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				horizontalRule: false,
				blockquote: false,
			}),
			Placeholder.configure({ placeholder: placeholderText }),
			...(anchorItems
				? [
						AnchorMention.configure({
							HTMLAttributes: { class: "mention-anchor" },
							suggestion: {
								char: "@",
								pluginKey: new PluginKey("anchorMention"),
								allowSpaces: true,
								items: ({ query }: { query: string }) => {
									const all = (anchorItemsRef.current ?? []).map((a) => ({
										id: a.id,
										label: a.label,
										badge: a.kind === "group" ? "group" : "file",
										badgeClass: a.kind === "group"
											? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
											: "bg-muted text-muted-foreground",
										mono: a.kind === "file",
										kind: a.kind,
									}));
									if (!query) return all.slice(0, 12);
									const q = query.toLowerCase();
									return all.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 12);
								},
								render: createSuggestionRender(suggestionOpenRef),
								command: ({ editor: ed, range, props: attrs }) => {
									const item = attrs as unknown as AnchorItem & SuggestionEntry;
									ed.chain()
										.focus()
										.insertContentAt(range, [
											{
												type: "anchorMention",
												attrs: { id: item.id, label: item.label, kind: item.kind ?? "file" },
											},
											{ type: "text", text: " " },
										])
										.run();
								},
							},
						}).extend({
							addAttributes() {
								return {
									...this.parent?.(),
									kind: { default: "file" },
								};
							},
						}),
					]
				: []),
			...(commands && commands.length > 0
				? [
						SlashCommand.configure({
							HTMLAttributes: { class: "mention-command" },
							suggestion: {
								char: "/",
								pluginKey: new PluginKey("slashCommand"),
								startOfLine: true,
								items: ({ query }: { query: string }) => {
									const all = (commandsRef.current ?? []).map((c) => ({
										id: c.id,
										label: `/${c.id}`,
										description: c.description,
									}));
									if (!query) return all;
									const q = query.toLowerCase();
									return all.filter((item) => item.id.toLowerCase().includes(q));
								},
								render: createSuggestionRender(suggestionOpenRef),
								command: ({ editor: ed, range, props: attrs }) => {
									ed.chain()
										.focus()
										.deleteRange(range)
										.insertContent(`/${attrs.id} `)
										.run();
								},
							},
						}),
					]
				: []),
		],
		editorProps: {
			attributes: {
				class: `outline-none min-h-[20px] ${className}`,
			},
			handleKeyDown: (_view, event) => {
				if (suggestionOpenRef.current) return false;
				if (event.key === "Escape" && callbacksRef.current.onEscape) {
					event.preventDefault();
					callbacksRef.current.onEscape();
					return true;
				}
				if (submitOnEnter && event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
					event.preventDefault();
					callbacksRef.current.onSubmit?.();
					return true;
				}
				if (submitOnModEnter && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					callbacksRef.current.onSubmit?.();
					return true;
				}
				return false;
			},
		},
		content: content ?? "",
		editable: !disabled,
		onUpdate: ({ editor: ed }) => {
			callbacksRef.current.onChange?.(ed.getText());
		},
	});

	useEffect(() => {
		if (editorRef) editorRef.current = editor;
	}, [editor, editorRef]);

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(!disabled);
	}, [editor, disabled]);

	useEffect(() => {
		if (!editor || content === undefined) return;
		const current = editor.getText();
		if (content !== current) {
			editor.commands.setContent(content ? `<p>${content.replace(/\n/g, "<br>")}</p>` : "");
		}
	}, [editor, content]);

	useEffect(() => {
		if (autoFocus && editor) {
			setTimeout(() => editor.commands.focus("end"), 0);
		}
	}, [autoFocus, editor]);

	return <EditorContent editor={editor} />;
}

export { getTextWithAnchors };
