import { useState, useEffect, useCallback } from "react";
import { X, Check, Loader2, Key, Bot, Globe, Settings2 } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";

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
	{ value: "claude", label: "Claude Code" },
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
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-0">
			<div className="flex items-center justify-between pb-6">
				<h2 className="text-lg font-semibold tracking-tight">Settings</h2>
				<div className="flex items-center gap-2">
					{saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
					{saved && <Check className="h-3.5 w-3.5 text-green-500" />}
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			</div>

			<div className="space-y-8">
				<Section icon={Key} title="Authentication">
					<Row label="OpenRouter API Key">
						{showApiKeyField ? (
							<div className="flex gap-2">
								<input
									type="password"
									value={apiKeyInput}
									onChange={(e) => setApiKeyInput(e.target.value)}
									placeholder="sk-or-..."
									className="flex-1 h-8 rounded-md border bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
									autoFocus
								/>
								<Button
									size="sm"
									disabled={!apiKeyInput.trim()}
									onClick={() => {
										save({ openrouter_api_key: apiKeyInput.trim() });
										setApiKeyInput("");
										setShowApiKeyField(false);
									}}
								>
									Save
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => { setShowApiKeyField(false); setApiKeyInput(""); }}
								>
									Cancel
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-3">
								<StatusDot ok={config.has_api_key} />
								<span className="text-sm text-muted-foreground">
									{config.has_api_key ? "Configured" : "Not set"}
								</span>
								<button
									type="button"
									onClick={() => setShowApiKeyField(true)}
									className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
								>
									{config.has_api_key ? "Change" : "Set key"}
								</button>
							</div>
						)}
					</Row>
					<Row label="GitHub Token">
						<div className="flex items-center gap-3">
							<StatusDot ok={config.has_github_token} />
							<span className="text-sm text-muted-foreground">
								{config.has_github_token ? "Detected from gh CLI" : "Not detected"}
							</span>
						</div>
					</Row>
				</Section>

				<Section icon={Bot} title="Model & Agent">
					<Row label="Model">
						<select
							value={config.model}
							onChange={(e) => save({ model: e.target.value })}
							className="h-8 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
						>
							{MODELS.map((m) => (
								<option key={m} value={m}>{m.split("/").pop()}</option>
							))}
						</select>
					</Row>
					<Row label="Exploration Agent">
						<div className="flex gap-1.5">
							{AGENTS.map((a) => (
								<button
									key={a.value}
									type="button"
									onClick={() => save({ agent: a.value })}
									className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
										(config.agent ?? "") === a.value
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground hover:text-foreground"
									}`}
								>
									{a.label}
								</button>
							))}
						</div>
					</Row>
				</Section>

				<Section icon={Globe} title="Language">
					<Row label="Output Language">
						<select
							value={config.language}
							onChange={(e) => save({ language: e.target.value })}
							className="h-8 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
						>
							{LANGUAGES.map((l) => (
								<option key={l} value={l}>{l === "auto" ? "Auto-detect" : l}</option>
							))}
						</select>
					</Row>
				</Section>

				<Section icon={Settings2} title="Advanced">
					<Row label="Max files">
						<NumberInput
							value={config.max_files}
							defaultValue={config.defaults.max_files}
							onChange={(v) => save({ max_files: v })}
						/>
					</Row>
					<Row label="Timeout (sec)">
						<NumberInput
							value={config.timeout}
							defaultValue={config.defaults.timeout}
							onChange={(v) => save({ timeout: v })}
						/>
					</Row>
					<Row label="Concurrency">
						<NumberInput
							value={config.concurrency}
							defaultValue={config.defaults.concurrency}
							onChange={(v) => save({ concurrency: v })}
						/>
					</Row>
				</Section>
			</div>
		</div>
	);
}

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof Key;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="flex items-center gap-2 mb-4">
				<Icon className="h-4 w-4 text-muted-foreground" />
				<h3 className="text-sm font-medium">{title}</h3>
			</div>
			<div className="space-y-4 pl-6">{children}</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<label className="text-sm text-muted-foreground shrink-0">{label}</label>
			<div className="flex-1 flex justify-end">{children}</div>
		</div>
	);
}

function StatusDot({ ok }: { ok: boolean }) {
	return (
		<span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
	);
}

function NumberInput({
	value,
	onChange,
}: {
	value: number;
	defaultValue?: number;
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
			className="w-20 h-8 rounded-md border bg-background px-3 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
		/>
	);
}
