import { useState, useEffect, useCallback } from "react";
import { analytics } from "../lib/analytics.ts";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
	const resolved = theme === "system" ? getSystemTheme() : theme;
	document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem("newpr-theme");
		return (stored as Theme) ?? "system";
	});

	useEffect(() => {
		applyTheme(theme);
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => { if (theme === "system") applyTheme("system"); };
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);

	const setTheme = useCallback((t: Theme) => {
		localStorage.setItem("newpr-theme", t);
		setThemeState(t);
		analytics.themeChanged(t);
	}, []);

	return { theme, setTheme };
}
