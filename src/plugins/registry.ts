import type { GeneratorPlugin } from "./types.ts";
import { cartoonPlugin } from "./cartoon.ts";
import { slidesPlugin } from "./slides.ts";

const plugins: GeneratorPlugin[] = [
	slidesPlugin,
	cartoonPlugin,
];

export function getPlugin(id: string): GeneratorPlugin | undefined {
	return plugins.find((p) => p.id === id);
}

export function getAllPlugins(): GeneratorPlugin[] {
	return plugins;
}

export function getPluginIds(): string[] {
	return plugins.map((p) => p.id);
}
