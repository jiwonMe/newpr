import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { en, type TranslationKeys } from "./en.ts";
import { ko } from "./ko.ts";

export type Locale = "en" | "ko";

const LOCALES: Record<Locale, TranslationKeys> = { en, ko: ko as unknown as TranslationKeys };
const STORAGE_KEY = "newpr-locale";

function detectLocale(): Locale {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "en" || stored === "ko") return stored;
	} catch {}
	const nav = navigator.language.toLowerCase();
	if (nav.startsWith("ko")) return "ko";
	return "en";
}

type FlatKeys<T, Prefix extends string = ""> = T extends Record<string, unknown>
	? { [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : FlatKeys<T[K], `${Prefix}${K}.`> }[keyof T & string]
	: never;

export type TranslationKey = FlatKeys<TranslationKeys>;

function getNestedValue(obj: unknown, path: string): string {
	let current = obj;
	for (const key of path.split(".")) {
		if (current == null || typeof current !== "object") return path;
		current = (current as Record<string, unknown>)[key];
	}
	return typeof current === "string" ? current : path;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (_, key: string) => {
		const val = params[key];
		return val !== undefined ? String(val) : `{${key}}`;
	});
}

interface I18nContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(detectLocale);

	const setLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		try { localStorage.setItem(STORAGE_KEY, next); } catch {}
	}, []);

	const t = useCallback(
		(key: TranslationKey, params?: Record<string, string | number>) => {
			const raw = getNestedValue(LOCALES[locale], key);
			return interpolate(raw, params);
		},
		[locale],
	);

	const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n must be used within I18nProvider");
	return ctx;
}
