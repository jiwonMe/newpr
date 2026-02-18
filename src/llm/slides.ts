import type { NewprOutput, SlideImage, SlideDeck, SlidePlan, SlideSpec } from "../types/output.ts";

function getSystemLanguage(): string {
	const env = process.env.LANG ?? process.env.LANGUAGE ?? process.env.LC_ALL ?? "";
	if (env.startsWith("ko")) return "Korean";
	if (env.startsWith("ja")) return "Japanese";
	if (env.startsWith("zh")) return "Chinese";
	if (env.startsWith("es")) return "Spanish";
	if (env.startsWith("fr")) return "French";
	if (env.startsWith("de")) return "German";
	return "English";
}

function buildPrContext(data: NewprOutput): string {
	const groupDetails = data.groups.map((g) => `- ${g.name} (${g.type}): ${g.description}\n  Files: ${g.files.join(", ")}${g.key_changes ? `\n  Key changes: ${g.key_changes.join("; ")}` : ""}${g.risk ? `\n  Risk: ${g.risk}` : ""}`).join("\n");
	const fileSummaries = data.files.slice(0, 30).map((f) => `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions}): ${f.summary}`).join("\n");

	return `PR: #${data.meta.pr_number} "${data.meta.pr_title}"
Author: ${data.meta.author}
Repo: ${data.meta.pr_url.split("/pull/")[0]?.split("github.com/")[1] ?? ""}
Branches: ${data.meta.head_branch} → ${data.meta.base_branch}
Stats: ${data.meta.total_files_changed} files, +${data.meta.total_additions} -${data.meta.total_deletions}
Risk: ${data.summary.risk_level}
State: ${data.meta.pr_state ?? "open"}

Purpose: ${data.summary.purpose}
Scope: ${data.summary.scope}
Impact: ${data.summary.impact}

Change Groups:
${groupDetails}

File Summaries:
${fileSummaries}

Narrative:
${data.narrative.slice(0, 3000)}`;
}

function buildStylePrompt(data: NewprOutput): { system: string; user: string } {
	return {
		system: `You are a world-class presentation designer specializing in technical presentations for software engineering teams.

Your task is to design a comprehensive visual style system for a slide deck about a Pull Request. This style will be used as a prompt for an image generation model (Gemini) to render each slide, so you must be EXTREMELY specific and detailed.

Output a single string — the style prompt. It must cover ALL of the following in exhaustive detail:

## Color System
- Exact hex codes for: primary background, secondary background, text primary, text secondary, accent color, code block background, code text, highlight/emphasis, success (green), warning (yellow), danger (red)
- Gradient specifications if any (direction, stops)
- How colors interact (contrast ratios, when to use each)

## Typography
- Primary font family (suggest a specific well-known font)
- Title: exact size in px, weight, letter-spacing, color
- Subtitle: exact size, weight, color
- Body text: exact size, line-height, color
- Code/monospace: font family, size, color, background
- Captions/labels: size, weight, color, text-transform
- Bullet points: style, indentation, spacing between items

## Layout Grid
- Slide dimensions: 1920x1080 (16:9)
- Margins: top, bottom, left, right in px
- Title position: x, y coordinates and alignment
- Content area: bounds in px
- Column layouts: when to use 1-col, 2-col, 3-col, and exact widths
- Spacing between elements in px

## Visual Elements
- Code blocks: border-radius, padding, syntax highlighting theme, line numbers yes/no
- Diagrams/flowcharts: node style, arrow style, colors
- Icons: style (outline/filled), size, color
- Dividers/separators: style, color, thickness
- Cards/boxes: background, border, border-radius, shadow, padding
- Badges/tags: shape, colors for different types (feature, bugfix, refactor, etc.)

## Slide-Type Templates
- Title slide: layout, where logo/branding goes, title size, subtitle placement
- Content slide: title bar height, content area layout
- Code slide: how to display code with explanations
- Comparison slide: before/after or side-by-side layout
- Summary slide: key points layout, call-to-action area

## Mood & Aesthetic
- Overall feel (e.g., "modern dark engineering dashboard", "clean Apple keynote", "Linear-inspired minimal")
- What to AVOID (e.g., no clip art, no heavy shadows, no busy backgrounds)
- Professional tone appropriate for engineering team review

The style prompt should be a single continuous text paragraph (not JSON, not markdown) that an image generation AI can follow. Be specific enough that any slide generated with this style will look like it belongs to the same deck.

Respond with ONLY the style prompt string. No JSON wrapping, no explanation.`,
		user: buildPrContext(data),
	};
}

function buildSlidesPrompt(data: NewprOutput, stylePrompt: string, language?: string): { system: string; user: string } {
	const lang = language ?? getSystemLanguage();
	return {
		system: `You are a presentation content planner. You will receive a PR analysis and a visual style description. Your job is to plan the CONTENT of each slide.

Output a JSON object with:
- "slides": An array of slide specifications. Each slide has:
  - "index": slide number (0-based)
  - "title": slide title text (in ${lang})
  - "contentPrompt": A VERY detailed description of what should be on this slide — exact text content, layout within the slide, visual elements, code snippets if any. All visible text must be in ${lang}. Be extremely specific about positioning, what goes where, and what text to show.

Decide the number of slides based on the PR complexity:
- Small PR (1-3 groups, <10 files): 4-6 slides
- Medium PR (3-6 groups, 10-30 files): 6-10 slides
- Large PR (6+ groups, 30+ files): 8-14 slides

Typical slide structure:
- Slide 0: Title slide with PR name, author, repo, key stats
- Slide 1: Overview/motivation — why this PR exists
- Middle slides: One or more slides per major change group, showing key changes with specific code examples
- Near-end: Architecture/dependency impact if relevant
- Final slide: Summary with risk assessment and review notes

Each contentPrompt should be detailed enough that an image generation model can render the slide given the style guide. Include exact text, numbers, file paths, and code snippets to display.

Respond ONLY with the JSON object. No markdown, no explanation.`,
		user: `Visual Style:\n${stylePrompt}\n\n${buildPrContext(data)}`,
	};
}

function buildImagePrompt(stylePrompt: string, slide: SlideSpec): string {
	return `Generate a presentation slide image. 16:9 aspect ratio (1920x1080 pixels).

VISUAL STYLE (apply consistently):
${stylePrompt}

THIS SLIDE (slide ${slide.index + 1}):
Title: "${slide.title}"

CONTENT AND LAYOUT:
${slide.contentPrompt}

CRITICAL REQUIREMENTS:
- This is a real presentation slide, not an illustration or diagram
- All text must be clearly readable
- Use proper text hierarchy (title, subtitle, body, captions)
- Maintain consistent margins and alignment
- The slide should look professional and polished
- Render all text exactly as specified — do not paraphrase or translate`;
}

async function callOpenRouter(apiKey: string, model: string, system: string, user: string, maxTokens: number, timeoutMs: number): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://github.com/jiwonMe/newpr",
				"X-Title": "newpr",
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				temperature: 0.4,
				max_tokens: maxTokens,
			}),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`OpenRouter API ${res.status}: ${body.slice(0, 200)}`);
		}
		const json = await res.json() as { choices: Array<{ message: { content: string } }> };
		return json.choices[0]?.message?.content ?? "";
	} catch (err) {
		if ((err as Error).name === "AbortError") throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

async function renderSlides(
	apiKey: string,
	plan: SlidePlan,
	specsToRender: SlideSpec[],
	onProgress?: (msg: string, current: number, total: number) => void,
	onSlideComplete?: (completed: SlideImage[]) => void,
): Promise<{ completed: SlideImage[]; failed: number[] }> {
	const totalPlan = plan.slides.length;
	const completed: SlideImage[] = [];
	const failed: number[] = [];

	const conversationHistory: Array<{ role: string; content: string }> = [
		{
			role: "user",
			content: `You are generating a series of ${totalPlan} presentation slides. All slides MUST follow this exact visual style consistently:\n\n${plan.stylePrompt}\n\nI will now ask you to generate each slide one by one. Maintain EXACTLY the same visual style, colors, fonts, and layout principles across every slide. Respond with the slide image for each request.`,
		},
	];

	for (const spec of specsToRender) {
		onProgress?.(`Rendering slide ${spec.index + 1}/${totalPlan}: "${spec.title}"`, completed.length, specsToRender.length);

		const slidePrompt = `Generate slide ${spec.index + 1} of ${totalPlan}. 16:9 aspect ratio (1920x1080).

Title: "${spec.title}"

CONTENT AND LAYOUT:
${spec.contentPrompt}

IMPORTANT: Use the EXACT SAME visual style as all previous slides. Same colors, fonts, spacing, background.`;

		conversationHistory.push({ role: "user", content: slidePrompt });

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 120_000);

			try {
				const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
					method: "POST",
					signal: controller.signal,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://github.com/jiwonMe/newpr",
						"X-Title": "newpr",
					},
					body: JSON.stringify({
						model: "google/gemini-3-pro-image-preview",
						messages: conversationHistory,
						modalities: ["image", "text"],
					}),
				});

				if (!res.ok) {
					const body = await res.text();
					throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
				}

				const json = await res.json() as {
					choices?: Array<{
						message?: {
							content?: string | Array<{ type?: string; image_url?: { url?: string }; text?: string }>;
							images?: Array<{ image_url?: { url?: string } }>;
						};
					}>;
				};

				const msg = json.choices?.[0]?.message;
				let imageData: { base64: string; mimeType: string } | null = null;

				if (msg?.images) {
					for (const img of msg.images) {
						if (img.image_url?.url) {
							const match = img.image_url.url.match(/data:([^;]+);base64,(.+)/s);
							if (match) { imageData = { mimeType: match[1]!, base64: match[2]! }; break; }
						}
					}
				}

				if (!imageData) {
					const content = msg?.content;
					if (typeof content === "string") {
						const match = content.match(/data:([^;]+);base64,(.+)/s);
						if (match) imageData = { mimeType: match[1]!, base64: match[2]! };
					}
					if (!imageData && Array.isArray(content)) {
						for (const part of content) {
							if (part.type === "image_url" && part.image_url?.url) {
								const match = part.image_url.url.match(/data:([^;]+);base64,(.+)/s);
								if (match) { imageData = { mimeType: match[1]!, base64: match[2]! }; break; }
							}
						}
					}
				}

				if (!imageData) throw new Error(`No image in response for slide ${spec.index + 1}`);

				conversationHistory.push({ role: "assistant", content: `[Slide ${spec.index + 1} image generated successfully]` });

				completed.push({
					index: spec.index,
					imageBase64: imageData.base64,
					mimeType: imageData.mimeType,
					title: spec.title,
				});
				onProgress?.(`Slide ${spec.index + 1}/${totalPlan} done (${completed.length}/${specsToRender.length})`, completed.length, specsToRender.length);
				onSlideComplete?.([...completed]);
			} finally {
				clearTimeout(timeout);
			}
		} catch (err) {
			failed.push(spec.index);
			conversationHistory.push({ role: "assistant", content: `[Slide ${spec.index + 1} failed]` });
			onProgress?.(`Slide ${spec.index + 1}/${totalPlan} failed: ${err instanceof Error ? err.message : String(err)}`, completed.length + failed.length, specsToRender.length);
		}
	}

	return { completed, failed };
}

export async function generateSlides(
	apiKey: string,
	data: NewprOutput,
	_planModel?: string,
	language?: string,
	onProgress?: (msg: string, current: number, total: number) => void,
	existingDeck?: SlideDeck | null,
	onPlan?: (plan: SlidePlan, imagePrompts: Array<{ index: number; prompt: string }>) => void,
	onSlideComplete?: (partialDeck: SlideDeck) => void,
): Promise<SlideDeck> {
	let plan: SlidePlan;

	if (existingDeck?.plan && existingDeck.plan.slides.length > 0) {
		plan = existingDeck.plan;
		onProgress?.(`Resuming with existing plan (${plan.slides.length} slides)...`, 0, plan.slides.length);
	} else {
		const OPUS_MODEL = "anthropic/claude-opus-4.6";

		onProgress?.("Step 1/2: Designing visual style (Opus)...", 0, 1);
		const styleP = buildStylePrompt(data);
		const styleContent = await callOpenRouter(apiKey, OPUS_MODEL, styleP.system, styleP.user, 4096, 120_000);
		const stylePrompt = styleContent.trim();
		onProgress?.(`Style designed (${stylePrompt.length} chars)`, 0, 1);

		onProgress?.("Step 2/2: Planning slide content (Opus)...", 0, 1);
		const slidesP = buildSlidesPrompt(data, stylePrompt, language);
		const slidesContent = await callOpenRouter(apiKey, OPUS_MODEL, slidesP.system, slidesP.user, 8192, 120_000);

		let rawContent = slidesContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
		const jsonStart = rawContent.indexOf("{");
		const jsonEnd = rawContent.lastIndexOf("}");
		if (jsonStart >= 0 && jsonEnd > jsonStart) {
			rawContent = rawContent.slice(jsonStart, jsonEnd + 1);
		}
		const parsed = JSON.parse(rawContent) as { slides: SlideSpec[] };
		if (!parsed.slides || parsed.slides.length === 0) throw new Error("Empty slide plan");

		plan = { stylePrompt, slides: parsed.slides };
		onProgress?.(`Plan ready: ${plan.slides.length} slides`, 0, plan.slides.length);
	}

	const imagePrompts = plan.slides.map((spec) => ({
		index: spec.index,
		prompt: buildImagePrompt(plan.stylePrompt, spec),
	}));
	onPlan?.(plan, imagePrompts);

	const existingSlides = existingDeck?.slides ?? [];
	const existingIndices = new Set(existingSlides.map((s) => s.index));
	const specsToRender = existingDeck?.failedIndices && existingDeck.failedIndices.length > 0
		? plan.slides.filter((s) => existingDeck.failedIndices!.includes(s.index))
		: plan.slides.filter((s) => !existingIndices.has(s.index));

	if (specsToRender.length === 0 && existingSlides.length > 0) {
		onProgress?.("All slides already generated", existingSlides.length, existingSlides.length);
		return { slides: existingSlides.sort((a, b) => a.index - b.index), plan, generatedAt: existingDeck?.generatedAt ?? new Date().toISOString() };
	}

	onProgress?.(`Generating ${specsToRender.length} slide${specsToRender.length > 1 ? "s" : ""}...`, 0, specsToRender.length);
	const { completed, failed } = await renderSlides(apiKey, plan, specsToRender, onProgress, (partialCompleted) => {
		const allSlides = [...existingSlides.filter((s) => !partialCompleted.some((c) => c.index === s.index)), ...partialCompleted].sort((a, b) => a.index - b.index);
		const remaining = specsToRender.filter((s) => !partialCompleted.some((c) => c.index === s.index)).map((s) => s.index);
		onSlideComplete?.({ slides: allSlides, plan, failedIndices: remaining.length > 0 ? remaining : undefined, generatedAt: new Date().toISOString() });
	});

	const allSlides = [...existingSlides.filter((s) => !completed.some((c) => c.index === s.index)), ...completed]
		.sort((a, b) => a.index - b.index);

	if (allSlides.length === 0) throw new Error("All slide generations failed");

	return {
		slides: allSlides,
		plan,
		failedIndices: failed.length > 0 ? failed : undefined,
		generatedAt: new Date().toISOString(),
	};
}
