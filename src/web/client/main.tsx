import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { I18nProvider } from "./lib/i18n/index.ts";

const el = document.getElementById("root");
if (el) {
	createRoot(el).render(
		<React.StrictMode>
			<I18nProvider>
				<App />
			</I18nProvider>
		</React.StrictMode>,
	);
}
