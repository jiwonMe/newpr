import type { NewprOutput } from "../types/output.ts";

export interface PluginContext {
	apiKey: string;
	sessionId: string;
	data: NewprOutput;
	language: string;
}

export interface PluginProgressEvent {
	message: string;
	current: number;
	total: number;
}

export type PluginProgressCallback = (event: PluginProgressEvent) => void;

export interface PluginResult {
	type: string;
	data: unknown;
}

export interface GeneratorPlugin {
	id: string;
	name: string;
	description: string;
	icon: string;
	tabLabel: string;
	isAvailable: (ctx: PluginContext) => boolean;
	generate: (ctx: PluginContext, onProgress?: PluginProgressCallback, existingData?: unknown) => Promise<PluginResult>;
	save: (sessionId: string, data: unknown) => Promise<void>;
	load: (sessionId: string) => Promise<unknown | null>;
}
