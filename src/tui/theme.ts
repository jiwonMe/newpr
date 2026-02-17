export const T = {
	primary: "#5fafaf",
	primaryBold: "#87d7d7",

	text: "#c0c0c0",
	textBold: "#e0e0e0",
	muted: "#808080",
	faint: "#585858",
	border: "#444444",

	accent: "#d7af5f",

	ok: "#5faf5f",
	warn: "#d7af5f",
	error: "#d75f5f",

	added: "#5faf5f",
	deleted: "#d75f5f",
	modified: "#d7af5f",
	renamed: "#5f87af",
} as const;

export const STATUS_STYLE: Record<string, { icon: string; color: string }> = {
	added: { icon: "A", color: T.added },
	modified: { icon: "M", color: T.modified },
	deleted: { icon: "D", color: T.deleted },
	renamed: { icon: "R", color: T.renamed },
};

export const TYPE_STYLE: Record<string, { icon: string; color: string }> = {
	feature: { icon: "~", color: T.primary },
	refactor: { icon: "~", color: T.muted },
	bugfix: { icon: "~", color: T.error },
	chore: { icon: "~", color: T.faint },
	docs: { icon: "~", color: T.muted },
	test: { icon: "~", color: T.ok },
	config: { icon: "~", color: T.accent },
};

export const RISK_COLORS: Record<string, string> = {
	low: T.ok,
	medium: T.warn,
	high: T.error,
};
