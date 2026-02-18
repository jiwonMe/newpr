import { useState, useEffect, useCallback } from "react";
import { X, Check, Loader2 } from "lucide-react";

interface ConfigData {
	model: string;
	agent: string | null;
	language: string;
	max_files: number;
	timeout: number;
	concurrency: number;
	has_api_key: boolean;
	has_github_token: boolean;
	defaults: {
		model: string;
		language: string;
		max_files: number;
		timeout: number;
		concurrency: number;
	};
}

const MODELS = [
	"anthropic/claude-sonnet-4.5",
	"anthropic/claude-sonnet-4-20250514",
	"openai/gpt-4.1",
	"openai/o3",
	"google/gemini-2.5-pro-preview-06-05",
];

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

export function SettingsPanel({ onClose }: { onClose: () => void }) {
	const [config, setConfig] = useState<ConfigData | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [showApiKeyField, setShowApiKeyField] = useState(false);

	useEffect(() => {
		fetch("/api/config")
			.then((r) => r.json())
			.then((data) => setConfig(data as ConfigData))
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
		} finally {
			setSaving(false);
		}
	}, []);

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
						<select
							value={config.model}
							onChange={(e) => save({ model: e.target.value })}
							className="h-7 rounded-md border bg-background px-2 text-[11px] font-mono focus:outline-none focus:border-foreground/20 cursor-pointer"
						>
							{MODELS.map((m) => (
								<option key={m} value={m}>{m.split("/").pop()}</option>
							))}
						</select>
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
			</div>
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
