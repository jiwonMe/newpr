import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { NewprOutput, DiffComment, ChatMessage, CartoonImage } from "../types/output.ts";
import type { SessionRecord } from "./types.ts";

const HISTORY_DIR = join(homedir(), ".newpr", "history");
const INDEX_FILE = join(HISTORY_DIR, "index.json");
const SESSIONS_DIR = join(HISTORY_DIR, "sessions");

function ensureDirs(): void {
	mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function generateSessionId(): string {
	return randomBytes(8).toString("hex");
}

export function buildSessionRecord(id: string, data: NewprOutput): SessionRecord {
	const { meta, summary } = data;
	const repoParts = meta.pr_url.match(/github\.com\/([^/]+\/[^/]+)/);
	return {
		id,
		pr_url: meta.pr_url,
		pr_number: meta.pr_number,
		pr_title: meta.pr_title,
		pr_state: meta.pr_state,
		repo: repoParts?.[1] ?? "unknown",
		author: meta.author,
		analyzed_at: meta.analyzed_at,
		risk_level: summary.risk_level,
		total_files: meta.total_files_changed,
		total_additions: meta.total_additions,
		total_deletions: meta.total_deletions,
		summary_purpose: summary.purpose,
		data_path: `sessions/${id}.json`,
	};
}

async function readIndex(): Promise<SessionRecord[]> {
	try {
		const file = Bun.file(INDEX_FILE);
		if (!(await file.exists())) return [];
		return JSON.parse(await file.text()) as SessionRecord[];
	} catch {
		return [];
	}
}

async function writeIndex(records: SessionRecord[]): Promise<void> {
	ensureDirs();
	await Bun.write(INDEX_FILE, `${JSON.stringify(records, null, 2)}\n`);
}

export async function saveSession(data: NewprOutput): Promise<SessionRecord> {
	const id = generateSessionId();
	const record = buildSessionRecord(id, data);

	ensureDirs();
	await Bun.write(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(data, null, 2));

	const index = await readIndex();
	const deduped = index.filter(
		(r) => !(r.pr_url === record.pr_url && r.pr_number === record.pr_number),
	);
	const updated = [record, ...deduped];
	await writeIndex(updated);

	return record;
}

export async function listSessions(limit = 20): Promise<SessionRecord[]> {
	const index = await readIndex();
	return index.slice(0, limit);
}

export async function loadSession(id: string): Promise<NewprOutput | null> {
	try {
		const filePath = join(SESSIONS_DIR, `${id}.json`);
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as NewprOutput;
	} catch {
		return null;
	}
}

export async function clearHistory(): Promise<void> {
	if (existsSync(HISTORY_DIR)) {
		rmSync(HISTORY_DIR, { recursive: true });
	}
}

export async function savePatchesSidecar(
	id: string,
	patches: Record<string, string>,
): Promise<void> {
	ensureDirs();
	await Bun.write(
		join(SESSIONS_DIR, `${id}.patches.json`),
		JSON.stringify(patches),
	);
}

export async function loadPatchesSidecar(
	id: string,
): Promise<Record<string, string> | null> {
	try {
		const filePath = join(SESSIONS_DIR, `${id}.patches.json`);
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as Record<string, string>;
	} catch {
		return null;
	}
}

export async function loadSinglePatch(
	id: string,
	filePath: string,
): Promise<string | null> {
	const patches = await loadPatchesSidecar(id);
	if (!patches) return null;
	return patches[filePath] ?? null;
}

export async function saveCommentsSidecar(
	id: string,
	comments: DiffComment[],
): Promise<void> {
	ensureDirs();
	await Bun.write(
		join(SESSIONS_DIR, `${id}.comments.json`),
		JSON.stringify(comments, null, 2),
	);
}

export async function loadCommentsSidecar(
	id: string,
): Promise<DiffComment[] | null> {
	try {
		const filePath = join(SESSIONS_DIR, `${id}.comments.json`);
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as DiffComment[];
	} catch {
		return null;
	}
}

export async function saveChatSidecar(
	id: string,
	messages: ChatMessage[],
): Promise<void> {
	ensureDirs();
	await Bun.write(
		join(SESSIONS_DIR, `${id}.chat.json`),
		JSON.stringify(messages, null, 2),
	);
}

export async function loadChatSidecar(
	id: string,
): Promise<ChatMessage[] | null> {
	try {
		const filePath = join(SESSIONS_DIR, `${id}.chat.json`);
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as ChatMessage[];
	} catch {
		return null;
	}
}

export async function saveCartoonSidecar(
	id: string,
	cartoon: CartoonImage,
): Promise<void> {
	ensureDirs();
	await Bun.write(
		join(SESSIONS_DIR, `${id}.cartoon.json`),
		JSON.stringify(cartoon),
	);
}

export async function loadCartoonSidecar(
	id: string,
): Promise<CartoonImage | null> {
	try {
		const filePath = join(SESSIONS_DIR, `${id}.cartoon.json`);
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text()) as CartoonImage;
	} catch {
		return null;
	}
}

export function getHistoryPath(): string {
	return HISTORY_DIR;
}
