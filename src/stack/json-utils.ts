export type SafeParseResult<T = unknown> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function stripNonJsonArtifacts(raw: string): string {
	return raw
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/[\u001b\u009b]/g, "")
		.replace(/[\u2580-\u259F]/g, "")
		.replace(/[^\x20-\x7E\u00A0-\uFFFF\n\r\t]/g, "");
}

function extractCodeBlock(text: string): string | null {
	const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	return match?.[1]?.trim() ?? null;
}

function findJsonBoundaries(source: string): string | null {
	const objIdx = source.indexOf("{");
	const arrIdx = source.indexOf("[");
	let start = -1;
	if (objIdx >= 0 && arrIdx >= 0) start = Math.min(objIdx, arrIdx);
	else start = Math.max(objIdx, arrIdx);
	if (start < 0) return null;

	let inString = false;
	let escaped = false;
	const stack: string[] = [];

	for (let i = start; i < source.length; i++) {
		const ch = source[i]!;
		if (inString) {
			if (escaped) { escaped = false; continue; }
			if (ch === "\\") { escaped = true; continue; }
			if (ch === '"') inString = false;
			continue;
		}

		if (ch === '"') { inString = true; continue; }
		if (ch === "{" || ch === "[") { stack.push(ch); continue; }

		if (ch === "}" || ch === "]") {
			const top = stack[stack.length - 1];
			if ((top === "{" && ch === "}") || (top === "[" && ch === "]")) {
				stack.pop();
				if (stack.length === 0) {
					return source.slice(start, i + 1);
				}
			}
		}
	}

	return null;
}

function repairTruncatedJson(text: string): string {
	let depth = 0;
	let inStr = false;
	let esc = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (inStr) {
			if (esc) { esc = false; continue; }
			if (ch === "\\") { esc = true; continue; }
			if (ch === '"') inStr = false;
			continue;
		}
		if (ch === '"') { inStr = true; continue; }
		if (ch === "{" || ch === "[") depth++;
		if (ch === "}" || ch === "]") depth--;
	}

	let repaired = text;
	if (inStr) repaired += '"';
	while (depth > 0) {
		repaired += "}";
		depth--;
	}
	return repaired;
}

export function extractJsonFromText(raw: string): string {
	const cleaned = stripNonJsonArtifacts(raw);

	const fromBlock = extractCodeBlock(cleaned);
	if (fromBlock) {
		const bounded = findJsonBoundaries(fromBlock);
		if (bounded) return bounded;
		return fromBlock;
	}

	const bounded = findJsonBoundaries(cleaned);
	if (bounded) return bounded;

	return cleaned.trim();
}

export function safeParseJson<T = unknown>(raw: string): SafeParseResult<T> {
	const extracted = extractJsonFromText(raw);

	try {
		return { ok: true, data: JSON.parse(extracted) as T };
	} catch {
	}

	try {
		const repaired = repairTruncatedJson(extracted);
		return { ok: true, data: JSON.parse(repaired) as T };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
