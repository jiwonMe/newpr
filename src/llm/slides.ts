import type { NewprOutput, SlideImage, SlideDeck, SlidePlan, SlideSpec } from "../types/output.ts";
import { detectAgents, runAgent } from "../workspace/agent.ts";

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

function buildPlanPrompt(data: NewprOutput, language?: string): { system: string; user: string } {
	const lang = language ?? getSystemLanguage();
	const groupDetails = data.groups.map((g) => `- ${g.name} (${g.type}): ${g.description}\n  Files: ${g.files.join(", ")}${g.key_changes ? `\n  Key changes: ${g.key_changes.join("; ")}` : ""}${g.risk ? `\n  Risk: ${g.risk}` : ""}`).join("\n");
	const fileSummaries = data.files.slice(0, 30).map((f) => `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions}): ${f.summary}`).join("\n");

	return {
		system: `You are a presentation designer creating a slide deck that explains a Pull Request to a development team.

You must output a JSON object with:
1. "stylePrompt": A detailed visual style description for ALL slides. This should describe:
   - Overall aesthetic (modern, minimal, dark/light theme)
   - Typography style (font sizes, weights, hierarchy)
   - Color palette (specific hex colors for background, text, accents)
   - Layout principles (margins, alignment, spacing)
   - Visual elements (code blocks style, diagrams style, icons usage)
   - The style should be consistent across all slides
   - Slides are 16:9 aspect ratio (1920x1080)

2. "slides": An array of slide specifications. Each slide has:
   - "index": slide number (0-based)
   - "title": slide title text (in ${lang})
   - "contentPrompt": A VERY detailed prompt describing exactly what should be on this slide — text content, layout, visual elements, code snippets if relevant. All text content must be in ${lang}. Be extremely specific about positioning and content.

Decide the number of slides based on the PR complexity:
- Small PR (1-3 groups, <10 files): 4-6 slides
- Medium PR (3-6 groups, 10-30 files): 6-10 slides
- Large PR (6+ groups, 30+ files): 8-14 slides

Typical slide structure:
- Slide 0: Title slide with PR name, author, repo, key stats
- Slide 1: Overview/motivation — why this PR exists
- Middle slides: One or more slides per major change group, showing key changes
- Near-end: Architecture/dependency impact if relevant
- Final slide: Summary with risk assessment and review notes

Respond ONLY with the JSON object. No markdown, no explanation.`,
		user: `PR: #${data.meta.pr_number} "${data.meta.pr_title}"
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
${data.narrative.slice(0, 3000)}`,
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

async function callGeminiImageGen(apiKey: string, prompt: string): Promise<{ base64: string; mimeType: string }> {
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
				messages: [{ role: "user", content: prompt }],
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

		if (msg?.images) {
			for (const img of msg.images) {
				if (img.image_url?.url) {
					const match = img.image_url.url.match(/data:([^;]+);base64,(.+)/s);
					if (match) return { mimeType: match[1]!, base64: match[2]! };
				}
			}
		}

		const content = msg?.content;
		if (typeof content === "string") {
			const match = content.match(/data:([^;]+);base64,(.+)/s);
			if (match) return { mimeType: match[1]!, base64: match[2]! };
		}

		if (Array.isArray(content)) {
			for (const part of content) {
				if (part.type === "image_url" && part.image_url?.url) {
					const match = part.image_url.url.match(/data:([^;]+);base64,(.+)/s);
					if (match) return { mimeType: match[1]!, base64: match[2]! };
				}
			}
		}

		throw new Error(`No image in response: ${JSON.stringify(msg).slice(0, 300)}`);
	} finally {
		clearTimeout(timeout);
	}
}

async function renderSlides(
	apiKey: string,
	plan: SlidePlan,
	specsToRender: SlideSpec[],
	onProgress?: (msg: string, current: number, total: number) => void,
): Promise<{ completed: SlideImage[]; failed: number[] }> {
	const totalPlan = plan.slides.length;
	const completed: SlideImage[] = [];
	const failed: number[] = [];

	let doneCount = 0;
	await Promise.all(
		specsToRender.map(async (spec) => {
			onProgress?.(`Rendering slide ${spec.index + 1}/${totalPlan}: "${spec.title}"`, doneCount, specsToRender.length);
			const prompt = buildImagePrompt(plan.stylePrompt, spec);
			try {
				const img = await callGeminiImageGen(apiKey, prompt);
				completed.push({
					index: spec.index,
					imageBase64: img.base64,
					mimeType: img.mimeType,
					title: spec.title,
				});
				doneCount++;
				onProgress?.(`Slide ${spec.index + 1}/${totalPlan} done (${doneCount}/${specsToRender.length})`, doneCount, specsToRender.length);
			} catch (err) {
				failed.push(spec.index);
				doneCount++;
				onProgress?.(`Slide ${spec.index + 1}/${totalPlan} failed: ${err instanceof Error ? err.message : String(err)}`, doneCount, specsToRender.length);
			}
		}),
	);

	return { completed, failed };
}

export async function generateSlides(
	apiKey: string,
	data: NewprOutput,
	planModel?: string,
	language?: string,
	onProgress?: (msg: string, current: number, total: number) => void,
	existingDeck?: SlideDeck | null,
): Promise<SlideDeck> {
	let plan: SlidePlan;

	if (existingDeck?.plan && existingDeck.plan.slides.length > 0) {
		plan = existingDeck.plan;
		onProgress?.(`Resuming with existing plan (${plan.slides.length} slides)...`, 0, plan.slides.length);
	} else {
		onProgress?.("Planning slide deck...", 0, 1);
		const planPrompt = buildPlanPrompt(data, language);
		let rawContent = "";

		const agents = await detectAgents();
		if (agents.length > 0) {
			onProgress?.(`Planning via ${agents[0]!.name}...`, 0, 1);
			try {
				const result = await runAgent(agents[0]!, process.cwd(), `${planPrompt.system}\n\n${planPrompt.user}\n\nRespond ONLY with the JSON object. No explanation, no markdown fences, just raw JSON.`, {
					timeout: 120_000,
					onOutput: (line) => onProgress?.(`Planning: ${line}`, 0, 1),
				});
				rawContent = result.answer;
				if (rawContent) {
					onProgress?.(`Agent returned ${rawContent.length} chars`, 0, 1);
				} else {
					onProgress?.("Agent returned empty response, falling back...", 0, 1);
				}
			} catch (err) {
				onProgress?.(`Agent error: ${err instanceof Error ? err.message : String(err)}`, 0, 1);
			}
		} else {
			onProgress?.("No agent available, using OpenRouter...", 0, 1);
		}

		if (!rawContent || !rawContent.includes("slides")) {
			onProgress?.("Planning via OpenRouter...", 0, 1);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 90_000);
			try {
				const planRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
					method: "POST",
					signal: controller.signal,
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://github.com/jiwonMe/newpr",
						"X-Title": "newpr",
					},
					body: JSON.stringify({
						model: planModel ?? "anthropic/claude-sonnet-4",
						messages: [
							{ role: "system", content: planPrompt.system },
							{ role: "user", content: planPrompt.user },
						],
						temperature: 0.4,
						max_tokens: 8192,
					}),
				});
				clearTimeout(timeout);
				if (!planRes.ok) {
					const errBody = await planRes.text().catch(() => "");
					throw new Error(`Plan API error ${planRes.status}: ${errBody.slice(0, 200)}`);
				}
				const planJson = await planRes.json() as { choices: Array<{ message: { content: string } }> };
				rawContent = planJson.choices[0]?.message?.content ?? "";
				onProgress?.(`OpenRouter returned ${rawContent.length} chars`, 0, 1);
			} catch (err) {
				clearTimeout(timeout);
				if ((err as Error).name === "AbortError") {
					throw new Error("Plan generation timed out after 90 seconds");
				}
				throw err;
			}
		}

		rawContent = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
		const jsonStart = rawContent.indexOf("{");
		const jsonEnd = rawContent.lastIndexOf("}");
		if (jsonStart >= 0 && jsonEnd > jsonStart) {
			rawContent = rawContent.slice(jsonStart, jsonEnd + 1);
		}
		plan = JSON.parse(rawContent) as SlidePlan;
		if (!plan.slides || plan.slides.length === 0) throw new Error("Empty slide plan");
		onProgress?.(`Plan ready: ${plan.slides.length} slides`, 0, plan.slides.length);
	}

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
	const { completed, failed } = await renderSlides(apiKey, plan, specsToRender, onProgress);

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
