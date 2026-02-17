import type { NewprOutput } from "../types/output.ts";

const CARTOON_MODEL = "google/gemini-3-pro-image-preview";

function buildCartoonPrompt(data: NewprOutput, language: string): string {
	const { meta, summary, groups, narrative } = data;
	const lang = language === "auto" ? "English" : language;
	const groupList = groups.slice(0, 5).map((g) => `- ${g.name}: ${g.description.slice(0, 80)}`).join("\n");
	const storyExcerpt = narrative
		.replace(/\[\[(group|file):[^\]]+\]\]/g, "")
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("#"))
		.slice(0, 6)
		.join(" ")
		.slice(0, 500);

	return `Generate an image of a funny 4-panel comic strip about this Pull Request.

## PR Context
Title: "${meta.pr_title}"
Author: ${meta.author}
Purpose: ${summary.purpose}
Scope: ${summary.scope}
Impact: ${summary.impact}
Risk: ${summary.risk_level}
Changes: +${meta.total_additions} -${meta.total_deletions} across ${meta.total_files_changed} files

## What happened (key changes):
${groupList}

## Story:
${storyExcerpt}

## Comic Requirements:
- 2x2 grid, 4 panels
- Cute stick-figure developer characters with expressive faces and gestures
- Speech bubbles with SHORT, witty dialogue in ${lang}
- Panel 1: The developer discovers the problem or receives the task (based on the PR purpose above)
- Panel 2: The developer's ambitious plan or approach (based on the actual changes)
- Panel 3: A funny complication that reflects the real complexity (based on risk/impact)
- Panel 4: The resolution with a developer humor punchline
- The humor should be SPECIFIC to this PR's content, not generic programming jokes
- Make the characters expressive and the scenes detailed
- The image must be square (1:1 aspect ratio, 1080x1080px), suitable for Instagram
- Output only the image`;
}

interface CartoonResponse {
	choices: Array<{
		message: {
			content: string;
			images?: Array<{
				image_url: { url: string };
			}>;
		};
	}>;
}

const MAX_RETRIES = 3;

export async function generateCartoon(
	apiKey: string,
	data: NewprOutput,
	language: string,
): Promise<{ imageBase64: string; mimeType: string }> {
	const prompt = buildCartoonPrompt(data, language);

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://github.com/jiwonMe/newpr",
				"X-Title": "newpr-cartoon",
			},
			body: JSON.stringify({
				model: CARTOON_MODEL,
				messages: [
					{ role: "user", content: prompt },
				],
				modalities: ["image", "text"],
				temperature: 1.0,
			}),
		});

		if (response.status === 500 || response.status === 502 || response.status === 503) {
			if (attempt < MAX_RETRIES) {
				await new Promise((r) => setTimeout(r, 2000 * attempt));
				continue;
			}
		}

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Cartoon generation failed (${response.status}): ${body.slice(0, 300)}`);
		}

		const result = await response.json() as CartoonResponse;
		const message = result.choices?.[0]?.message;

		if (message?.images?.length) {
			const imageUrl = message.images[0]!.image_url.url;
			const match = imageUrl.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
			if (match) {
				return { imageBase64: match[2]!, mimeType: `image/${match[1]}` };
			}
			const imgRes = await fetch(imageUrl);
			if (imgRes.ok) {
				const buf = await imgRes.arrayBuffer();
				return {
					imageBase64: Buffer.from(buf).toString("base64"),
					mimeType: imgRes.headers.get("content-type") ?? "image/png",
				};
			}
		}

		if (attempt < MAX_RETRIES) {
			await new Promise((r) => setTimeout(r, 2000 * attempt));
			continue;
		}

		const raw = JSON.stringify(result).slice(0, 500);
		throw new Error(`No image in response. Raw: ${raw}`);
	}

	throw new Error("Cartoon generation failed after retries");
}
