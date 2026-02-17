import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

export function AppShell({
	theme,
	onThemeChange,
	children,
}: {
	theme: Theme;
	onThemeChange: (t: Theme) => void;
	children: React.ReactNode;
}) {
	const Icon = THEME_ICON[theme];
	const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;

	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
					<div className="flex items-center gap-2">
						<span className="text-lg font-bold tracking-tight">newpr</span>
						<span className="text-xs text-muted-foreground">v0.1.0</span>
					</div>
					<button
						type="button"
						onClick={() => onThemeChange(next)}
						className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
						title={`Switch to ${next} mode`}
					>
						<Icon className="h-4 w-4" />
					</button>
				</div>
			</header>
			<main className="mx-auto max-w-5xl px-6 py-8">
				{children}
			</main>
		</div>
	);
}
