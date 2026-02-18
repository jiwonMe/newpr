import { useState, useEffect, useCallback, useRef } from "react";
import { X, Check, Loader2, Search, ChevronDown } from "lucide-react";

interface ConfigData {
	model: string;
	agent: string | null;
	language: string;
	max_files: number;
	timeout: number;
	concurrency: number;
	has_api_key: boolean;
	has_github_token: boolean;
	enabled_plugins: string[];
	available_plugins: Array<{ id: string; name: string }>;
	defaults: {
		model: string;
		language: string;
		max_files: number;
		timeout: number;
		concurrency: number;
	};
}

interface ModelInfo {
	id: string;
	name: string;
	provider?: string;
	created?: number;
	contextLength?: number;
}

const AGENTS = [
	{ value: "", label: "Auto" },
	{ value: "claude", label: "Claude" },
	{ value: "opencode", label: "OpenCode" },
	{ value: "codex", label: "Codex" },
];

const LANGUAGES = [
	"auto", "English", "Korean", "Japanese", "Chinese",
	"Spanish", "French", "German", "Portuguese",
];

export function SettingsPanel({ onClose, onFeaturesChange }: { onClose: () => void; onFeaturesChange?: () => void }) {
	const [config, setConfig] = useState<ConfigData | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [showApiKeyField, setShowApiKeyField] = useState(false);
	const [models, setModels] = useState<ModelInfo[]>([]);

	useEffect(() => {
		fetch("/api/config")
			.then((r) => r.json())
			.then((data) => {
				setConfig(data as ConfigData);
				if ((data as ConfigData).has_api_key) {
					fetch("/api/models")
						.then((r) => r.json())
						.then((m) => setModels(m as ModelInfo[]))
						.catch(() => {});
				}
			})
			.catch(() => {});
	}, []);

	const save = useCallback(async (update: Record<string, unknown>) => {
		setSaving(true);
		setSaved(false);
		try {
			await fetch("/api/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(update),
			});
			const res = await fetch("/api/config");
			const data = await res.json();
			setConfig(data as ConfigData);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
			if (update.enabled_plugins !== undefined) onFeaturesChange?.();
		} finally {
			setSaving(false);
		}
	}, [onFeaturesChange]);

	if (!config) {
		return (
			<div className="flex items-center justify-center py-20">
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
			</div>
		);
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-xs font-semibold">Settings</h2>
				<div className="flex items-center gap-2">
					{saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />}
					{saved && <Check className="h-3 w-3 text-green-500" />}
					<button
						type="button"
						onClick={onClose}
						className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent/40 transition-colors"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			<div className="space-y-6">
				<Section title="Authentication">
					<Row label="OpenRouter API Key">
						{showApiKeyField ? (
							<div className="flex gap-1.5">
								<input
									type="password"
									value={apiKeyInput}
									onChange={(e) => setApiKeyInput(e.target.value)}
									placeholder="sk-or-..."
									className="flex-1 h-7 rounded-md border bg-background px-2.5 text-[11px] font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20"
									autoFocus
									onKeyDown={(e) => {
										if (e.key === "Enter" && apiKeyInput.trim()) {
											save({ openrouter_api_key: apiKeyInput.trim() });
											setApiKeyInput("");
											setShowApiKeyField(false);
										}
										if (e.key === "Escape") {
											setShowApiKeyField(false);
											setApiKeyInput("");
										}
									}}
								/>
								<button
									type="button"
									disabled={!apiKeyInput.trim()}
									onClick={() => {
										save({ openrouter_api_key: apiKeyInput.trim() });
										setApiKeyInput("");
										setShowApiKeyField(false);
									}}
									className="h-7 px-2.5 rounded-md bg-foreground text-background text-[11px] font-medium disabled:opacity-20 hover:opacity-80 transition-opacity"
								>
									Save
								</button>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<span className={`h-1.5 w-1.5 rounded-full ${config.has_api_key ? "bg-green-500" : "bg-red-500"}`} />
								<span className="text-[11px] text-muted-foreground/50">
									{config.has_api_key ? "Configured" : "Not set"}
								</span>
								<button
									type="button"
									onClick={() => setShowApiKeyField(true)}
									className="text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
								>
									{config.has_api_key ? "Change" : "Set"}
								</button>
							</div>
						)}
					</Row>
					<Row label="GitHub Token">
						<div className="flex items-center gap-2">
							<span className={`h-1.5 w-1.5 rounded-full ${config.has_github_token ? "bg-green-500" : "bg-red-500"}`} />
							<span className="text-[11px] text-muted-foreground/50">
								{config.has_github_token ? "gh CLI" : "Not detected"}
							</span>
						</div>
					</Row>
				</Section>

				<Section title="Model">
					<Row label="LLM">
						{config.has_api_key ? (
							<ModelSelect
								value={config.model}
								models={models}
								onChange={(id: string) => save({ model: id })}
							/>
						) : (
							<span className="text-[11px] text-muted-foreground/40">Set API key first</span>
						)}
					</Row>
					<Row label="Agent">
						<div className="flex gap-px rounded-md border p-0.5">
							{AGENTS.map((a) => (
								<button
									key={a.value}
									type="button"
									onClick={() => save({ agent: a.value })}
									className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
										(config.agent ?? "") === a.value
											? "bg-accent text-foreground font-medium"
											: "text-muted-foreground/50 hover:text-foreground"
									}`}
								>
									{a.label}
								</button>
							))}
						</div>
					</Row>
					<Row label="Language">
						<select
							value={config.language}
							onChange={(e) => save({ language: e.target.value })}
							className="h-7 rounded-md border bg-background px-2 text-[11px] focus:outline-none focus:border-foreground/20 cursor-pointer"
						>
							{LANGUAGES.map((l) => (
								<option key={l} value={l}>{l === "auto" ? "Auto-detect" : l}</option>
							))}
						</select>
					</Row>
				</Section>

				<Section title="Limits">
					<Row label="Max files">
						<NumberInput value={config.max_files} onChange={(v) => save({ max_files: v })} />
					</Row>
					<Row label="Timeout">
						<div className="flex items-center gap-1.5">
							<NumberInput value={config.timeout} onChange={(v) => save({ timeout: v })} />
							<span className="text-[10px] text-muted-foreground/30">sec</span>
						</div>
					</Row>
					<Row label="Concurrency">
						<NumberInput value={config.concurrency} onChange={(v) => save({ concurrency: v })} />
					</Row>
				</Section>

				{config.available_plugins.length > 0 && (
					<Section title="Plugins">
						<div className="space-y-1">
							{config.available_plugins.map((p) => {
								const enabled = config.enabled_plugins.includes(p.id);
								return (
									<div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
										<div className="flex items-center gap-2 min-w-0">
											<span className={`h-1.5 w-1.5 rounded-full shrink-0 ${enabled ? "bg-green-500" : "bg-muted-foreground/20"}`} />
											<span className="text-[11px] truncate">{p.name}</span>
										</div>
										<button
											type="button"
											onClick={() => {
												const next = enabled
													? config.enabled_plugins.filter((id) => id !== p.id)
													: [...config.enabled_plugins, p.id];
												save({ enabled_plugins: next });
											}}
											className={`relative inline-flex h-4 w-7 items-center rounded-full shrink-0 transition-colors ${
												enabled ? "bg-foreground" : "bg-muted"
											}`}
										>
											<span className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
												enabled ? "translate-x-3.5" : "translate-x-0.5"
											}`} />
										</button>
									</div>
								);
							})}
						</div>
					</Section>
				)}
			</div>
		</div>
	);
}

function ModelSelect({ value, models: allModels, onChange }: { value: string; models: ModelInfo[]; onChange: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	useEffect(() => {
		if (open) {
			setSearch("");
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open]);

	const q = search.toLowerCase();
	const models = q
		? allModels.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
		: allModels;

	const displayName = value.split("/").pop() ?? value;

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 h-7 rounded-md border bg-background px-2.5 text-[11px] font-mono hover:border-foreground/20 transition-colors max-w-[220px]"
			>
				<span className="truncate flex-1 text-left">{displayName}</span>
				<ChevronDown className={`h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
			</button>
			{open && (
				<div className="absolute right-0 top-8 z-50 w-[320px] rounded-lg border bg-background shadow-lg">
					<div className="p-1.5 border-b">
						<div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/50">
							<Search className="h-3 w-3 text-muted-foreground/40 shrink-0" />
							<input
								ref={inputRef}
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search models..."
								className="flex-1 bg-transparent text-[11px] focus:outline-none placeholder:text-muted-foreground/30"
							/>
					</div>
				</div>
				<div className="max-h-[280px] overflow-y-auto p-1">
					{models.length === 0 && (
							<div className="px-2 py-3 text-center text-[11px] text-muted-foreground/40">No models found</div>
						)}
						{models.slice(0, 80).map((m, i) => {
							const isSelected = m.id === value;
							const provider = m.id.split("/")[0] ?? "";
							const name = m.id.split("/").slice(1).join("/");
							const prevProvider = i > 0 ? models[i - 1]!.id.split("/")[0] : null;
							const showHeader = provider !== prevProvider;
							return (
								<div key={m.id}>
									{showHeader && (
										<div className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground/30 uppercase tracking-wider">{provider}</div>
									)}
									<button
										type="button"
										onClick={() => { onChange(m.id); setOpen(false); }}
										className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
											isSelected ? "bg-accent" : "hover:bg-accent/50"
										}`}
									>
										<span className="text-[11px] font-mono truncate flex-1">{name}</span>
										{isSelected && <Check className="h-3 w-3 text-foreground shrink-0" />}
									</button>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-3">
				{title}
			</div>
			<div className="space-y-3">{children}</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<label className="text-[11px] text-muted-foreground/60 shrink-0">{label}</label>
			<div className="flex-1 flex justify-end">{children}</div>
		</div>
	);
}

function NumberInput({
	value,
	onChange,
}: {
	value: number;
	onChange: (v: number) => void;
}) {
	const [local, setLocal] = useState(String(value));

	useEffect(() => { setLocal(String(value)); }, [value]);

	function handleBlur() {
		const parsed = Number.parseInt(local, 10);
		if (!Number.isNaN(parsed) && parsed > 0 && parsed !== value) {
			onChange(parsed);
		} else {
			setLocal(String(value));
		}
	}

	return (
		<input
			type="number"
			value={local}
			onChange={(e) => setLocal(e.target.value)}
			onBlur={handleBlur}
			onKeyDown={(e) => { if (e.key === "Enter") handleBlur(); }}
			className="w-16 h-7 rounded-md border bg-background px-2 text-[11px] text-right font-mono tabular-nums focus:outline-none focus:border-foreground/20"
		/>
	);
}
