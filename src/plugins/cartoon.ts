import type { GeneratorPlugin, PluginContext, PluginProgressCallback, PluginResult } from "./types.ts";
import type { CartoonImage } from "../types/output.ts";
import { generateCartoon } from "../llm/cartoon.ts";
import { saveCartoonSidecar, loadCartoonSidecar } from "../history/store.ts";

export const cartoonPlugin: GeneratorPlugin = {
	id: "cartoon",
	name: "Comic Strip",
	description: "Generate a 4-panel comic strip that visualizes the key changes in this PR.",
	icon: "Sparkles",
	tabLabel: "Comic",

	isAvailable: (ctx) => !!ctx.apiKey,

	async generate(ctx: PluginContext, onProgress?: PluginProgressCallback): Promise<PluginResult> {
		onProgress?.({ message: "Generating comic strip...", current: 0, total: 1 });
		const result = await generateCartoon(ctx.apiKey, ctx.data, ctx.language);
		const cartoon: CartoonImage = {
			imageBase64: result.imageBase64,
			mimeType: result.mimeType,
			generatedAt: new Date().toISOString(),
		};
		onProgress?.({ message: "Comic strip done", current: 1, total: 1 });
		return { type: "cartoon", data: cartoon };
	},

	async save(sessionId: string, data: unknown): Promise<void> {
		await saveCartoonSidecar(sessionId, data as CartoonImage);
	},

	async load(sessionId: string): Promise<CartoonImage | null> {
		return loadCartoonSidecar(sessionId);
	},
};
