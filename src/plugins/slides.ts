import type { GeneratorPlugin, PluginContext, PluginProgressCallback, PluginResult } from "./types.ts";
import type { SlideDeck } from "../types/output.ts";
import { generateSlides } from "../llm/slides.ts";
import { saveSlidesSidecar, loadSlidesSidecar } from "../history/store.ts";

export const slidesPlugin: GeneratorPlugin = {
	id: "slides",
	name: "Slide Deck",
	description: "Generate a presentation that explains this PR to your team.",
	icon: "Presentation",
	tabLabel: "Slides",

	isAvailable: (ctx) => !!ctx.apiKey,

	async generate(ctx: PluginContext, onProgress?: PluginProgressCallback, existingData?: unknown): Promise<PluginResult> {
		const existing = existingData as SlideDeck | null | undefined;
		const deck = await generateSlides(
			ctx.apiKey,
			ctx.data,
			undefined,
			ctx.language,
			(msg, current, total) => onProgress?.({ message: msg, current, total }),
			existing,
			undefined,
			(partialDeck) => {
				saveSlidesSidecar(ctx.sessionId, partialDeck).catch(() => {});
			},
		);
		return { type: "slides", data: deck };
	},

	async save(sessionId: string, data: unknown): Promise<void> {
		await saveSlidesSidecar(sessionId, data as SlideDeck);
	},

	async load(sessionId: string): Promise<SlideDeck | null> {
		return loadSlidesSidecar(sessionId);
	},
};
