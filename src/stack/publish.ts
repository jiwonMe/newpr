import type { StackExecResult, StackPublishResult, BranchInfo, PrInfo } from "./types.ts";
import type { PrMeta } from "../types/output.ts";
import type { LlmClient } from "../llm/client.ts";
import { safeParseJson } from "./json-utils.ts";

export interface PublishInput {
	repo_path: string;
	exec_result: StackExecResult;
	pr_meta: PrMeta;
	base_branch: string;
	owner: string;
	repo: string;
	plan_groups?: StackPublishGroupMeta[];
	llm_client?: LlmClient;
	language?: string;
	publish_preview?: StackPublishPreviewResult | null;
}

export interface StackPublishGroupMeta {
	id: string;
	name: string;
	description: string;
	files: string[];
	order: number;
	type?: string;
	pr_title?: string;
	deps?: string[];
}

export interface StackPublishPreviewItem {
	group_id: string;
	title: string;
	base_branch: string;
	head_branch: string;
	order: number;
	total: number;
	body: string;
}

export interface StackPublishPreviewResult {
	template_path: string | null;
	items: StackPublishPreviewItem[];
}

const PR_TEMPLATE_PATHS = [
	".github/PULL_REQUEST_TEMPLATE.md",
	".github/pull_request_template.md",
	".github/PULL_REQUEST_TEMPLATE/default.md",
	".github/pull_request_template/default.md",
	"pull_request_template.md",
	"pull_request_template",
	".github/PULL_REQUEST_TEMPLATE",
	"PULL_REQUEST_TEMPLATE.md",
	"PULL_REQUEST_TEMPLATE",
	"docs/PULL_REQUEST_TEMPLATE.md",
	"docs/pull_request_template.md",
	"docs/pull_request_template",
];

const TEMPLATE_DIR_RE = /^\.github\/(?:PULL_REQUEST_TEMPLATE|pull_request_template)\/.+\.md$/i;
const STACK_NAV_COMMENT_MARKER = "<!-- newpr:stack-navigation -->";

interface PrTemplateData {
	path: string;
	content: string;
}

type TemplateSection = "reason" | "reference" | "solution" | "test" | "review" | "screenshot" | null;

type SectionBullets = Record<Exclude<TemplateSection, null>, string[]>;

interface TemplatePrefillContext {
	groupId: string;
	order: number;
	total: number;
	prMeta: PrMeta;
	groupMeta?: StackPublishGroupMeta;
	baseBranch?: string;
	headBranch?: string;
	template: string;
}

function buildGroupMetaMap(groups: StackPublishGroupMeta[] | undefined): Map<string, StackPublishGroupMeta> {
	const map = new Map<string, StackPublishGroupMeta>();
	for (const group of groups ?? []) {
		map.set(group.id, group);
	}
	return map;
}

function buildEffectiveGroupMeta(
	execResult: StackExecResult,
	groupMetaById: Map<string, StackPublishGroupMeta>,
): StackPublishGroupMeta[] {
	return execResult.group_commits.map((gc, index) => {
		const existing = groupMetaById.get(gc.group_id);
		if (existing) return existing;
		return {
			id: gc.group_id,
			name: gc.group_id,
			description: gc.pr_title ?? gc.group_id,
			files: [],
			order: index,
			pr_title: gc.pr_title,
		};
	});
}

function isPreviewCompatible(execResult: StackExecResult, preview: StackPublishPreviewResult | null | undefined): boolean {
	if (!preview || preview.items.length === 0) return false;
	if (preview.items.length !== execResult.group_commits.length) return false;

	for (let i = 0; i < execResult.group_commits.length; i++) {
		const commit = execResult.group_commits[i]!;
		const item = preview.items[i]!;
		if (item.group_id !== commit.group_id) return false;
		if (item.head_branch !== commit.branch_name) return false;
	}

	return true;
}

function formatFileList(files: string[], max = 5): string {
	if (files.length === 0) return "(none)";
	const shown = files.slice(0, max).join(", ");
	const rest = files.length - max;
	return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

function extractModuleAreas(files: string[], max = 4): string[] {
	const areas: string[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const parts = file.split("/").filter(Boolean);
		const area = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? file);
		if (!area || seen.has(area)) continue;
		seen.add(area);
		areas.push(area);
		if (areas.length >= max) break;
	}
	return areas;
}

function hasUiSurface(files: string[]): boolean {
	return files.some((file) => /\.(tsx|jsx|css|scss|sass|less|html|vue|svelte)$/i.test(file));
}

function isKoreanText(text: string): boolean {
	return /[가-힣]/.test(text);
}

function detectTemplateSection(heading: string): TemplateSection {
	const normalized = heading.trim().toLowerCase();
	if (/어떤 이유|이유로|why|reason|problem|배경|목적/.test(normalized)) return "reason";
	if (/reference|참고|자료|링크/.test(normalized)) return "reference";
	if (/어떻게 해결|how|해결|approach|solution|구현|변경/.test(normalized)) return "solution";
	if (/테스트|test|영향|검증|impact/.test(normalized)) return "test";
	if (/리뷰|review/.test(normalized)) return "review";
	if (/스크린샷|screenshot|as is|to be/.test(normalized)) return "screenshot";
	return null;
}

function buildPrefillBullets(ctx: TemplatePrefillContext): SectionBullets {
	const groupTitle = ctx.groupMeta?.pr_title ?? ctx.groupMeta?.name ?? ctx.groupId;
	const groupDesc = (ctx.groupMeta?.description ?? "").trim();
	const files = ctx.groupMeta?.files ?? [];
	const areas = extractModuleAreas(files);
	const areaSummary = areas.length > 0 ? areas.join(", ") : "(none)";
	const branchSummary = ctx.baseBranch && ctx.headBranch ? `${ctx.baseBranch} -> ${ctx.headBranch}` : null;
	const riskHint = ctx.groupMeta?.type === "bugfix"
		? "버그 재발 방지 관점"
		: ctx.groupMeta?.type === "refactor"
			? "회귀/호환성 관점"
			: "기능 완성도 관점";
	const useKorean = isKoreanText(`${ctx.template}\n${ctx.prMeta.pr_title}\n${groupTitle}\n${groupDesc}`);

	if (useKorean) {
		const reference = [ctx.prMeta.pr_url];
		if (branchSummary) reference.push(`stack branch: ${branchSummary}`);
		return {
			reason: [
				`원본 PR #${ctx.prMeta.pr_number}의 \"${groupTitle}\" 범위를 분리해 리뷰 단위를 축소했습니다.`,
				`스택 ${ctx.order}/${ctx.total} 순서에서 선행 변경 의존성을 유지한 상태로 독립 검토가 가능하도록 구성했습니다.`,
				groupDesc || `${groupTitle} 관련 변경을 집중 반영했습니다.`,
			],
			reference,
			solution: [
				groupDesc || `${groupTitle} 관련 변경을 반영했습니다.`,
				`주요 모듈: ${areaSummary}`,
				`대상 파일: ${formatFileList(files)}`,
			],
			test: [
				`스택 ${ctx.order}/${ctx.total} 범위(${groupTitle}) 기준 영향도 점검`,
				`회귀 체크 우선순위: ${areaSummary}`,
				`검토 포인트: ${riskHint}`,
			],
			review: [
				`${groupTitle} 변경과 ${files.length}개 파일 영향 범위를 중심으로 리뷰 부탁드립니다.`,
				`특히 ${areaSummary} 영역의 경계 조건/호환성 확인 부탁드립니다.`,
				`템플릿 항목 기준으로 누락된 컨텍스트가 있다면 코멘트로 요청 부탁드립니다.`,
			],
			screenshot: [
				hasUiSurface(files)
					? "| 변경 전 UI/흐름 캡처 필요 | 변경 후 UI/흐름 캡처 필요 |"
					: "| UI 변경 없음 (N/A) | UI 변경 없음 (N/A) |",
			],
		};
	}

	const reference = [ctx.prMeta.pr_url];
	if (branchSummary) reference.push(`stack branch: ${branchSummary}`);

	return {
		reason: [
			`Split the \"${groupTitle}\" scope from source PR #${ctx.prMeta.pr_number} to keep review focused.`,
			`Keep dependency order at stack ${ctx.order}/${ctx.total} while making this scope independently reviewable.`,
			groupDesc || `Focus this PR on ${groupTitle} changes.`,
		],
		reference,
		solution: [
			groupDesc || `Apply updates for ${groupTitle}.`,
			`Primary modules: ${areaSummary}.`,
			`Touched files: ${formatFileList(files)}.`,
		],
		test: [
			`Scoped impact check for stack ${ctx.order}/${ctx.total} (${groupTitle}).`,
			`Regression focus: ${areaSummary}.`,
			`Validation lens: ${ctx.groupMeta?.type ?? "change"} stability and compatibility.`,
		],
		review: [
			`Please focus on ${groupTitle} changes and impacts across ${files.length} files.`,
			`Pay extra attention to edge conditions around ${areaSummary}.`,
			`Leave comments for any missing context required by the template sections.`,
		],
		screenshot: [
			hasUiSurface(files)
				? "| Before-state UI/flow snapshot needed | After-state UI/flow snapshot needed |"
				: "| No UI changes (N/A) | No UI changes (N/A) |",
		],
	};
}

function normalizeBulletArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => String(item ?? "").trim())
		.filter(Boolean)
		.slice(0, 4);
}

function parseLlmPrefillResponse(raw: string): Map<string, SectionBullets> {
	const parseResult = safeParseJson(raw);
	if (!parseResult.ok) return new Map();
	const parsed = parseResult.data;

	if (!Array.isArray(parsed)) return new Map();

	const map = new Map<string, SectionBullets>();
	for (const item of parsed) {
		if (!item || typeof item !== "object") continue;
		const obj = item as Record<string, unknown>;
		const groupId = String(obj.group_id ?? "").trim();
		if (!groupId) continue;

		const bullets: SectionBullets = {
			reason: normalizeBulletArray(obj.reason),
			reference: normalizeBulletArray(obj.reference),
			solution: normalizeBulletArray(obj.solution),
			test: normalizeBulletArray(obj.test),
			review: normalizeBulletArray(obj.review),
			screenshot: normalizeBulletArray(obj.screenshot),
		};
		map.set(groupId, bullets);
	}

	return map;
}

async function generateTemplatePrefillWithLlm(
	llmClient: LlmClient | undefined,
	prMeta: PrMeta,
	groups: StackPublishGroupMeta[],
	template: string,
	language?: string,
): Promise<Map<string, SectionBullets>> {
	if (!llmClient || !template.trim() || groups.length === 0) return new Map();

	const hasKoreanContext = /[가-힣]/.test(`${prMeta.pr_title}\n${template}`) || groups.some((g) => /[가-힣]/.test(`${g.name} ${g.description}`));
	const lang = language && language !== "auto" ? language : (hasKoreanContext ? "Korean" : "English");

	const groupSummary = groups.map((g) => [
		`group_id: ${g.id}`,
		`title: ${g.pr_title ?? g.name}`,
		`type: ${g.type ?? "chore"}`,
		`description: ${g.description}`,
		`order: ${g.order + 1}/${groups.length}`,
		`files: ${formatFileList(g.files, 8)}`,
	].join("\n")).join("\n\n");

	const system = `You fill pull request template bullets for stacked PRs.

Return only JSON array with one object per group:
[
  {
    "group_id": "...",
    "reason": ["..."],
    "reference": ["..."],
    "solution": ["..."],
    "test": ["..."],
    "review": ["..."],
    "screenshot": ["..."]
  }
]

Rules:
- Write in ${lang}.
- Be concrete and specific to each group; avoid generic filler.
- 2-3 bullets per section when possible.
- Include file/module context from each group.
- screenshot section: if no UI changes, explicitly say N/A.
- No markdown code fences. JSON only.`;

	const user = `Source PR: #${prMeta.pr_number} ${prMeta.pr_title}
Source URL: ${prMeta.pr_url}

Template:
${template}

Groups:
${groupSummary}`;

	try {
		const response = await llmClient.complete(system, user);
		return parseLlmPrefillResponse(response.content);
	} catch {
		return new Map();
	}
}

function fillTemplatePlaceholders(
	template: string,
	ctx: TemplatePrefillContext,
	llmBullets?: SectionBullets,
): string {
	const fallbackBullets = buildPrefillBullets(ctx);
	const bullets: SectionBullets = {
		reason: llmBullets?.reason?.length ? llmBullets.reason : fallbackBullets.reason,
		reference: llmBullets?.reference?.length ? llmBullets.reference : fallbackBullets.reference,
		solution: llmBullets?.solution?.length ? llmBullets.solution : fallbackBullets.solution,
		test: llmBullets?.test?.length ? llmBullets.test : fallbackBullets.test,
		review: llmBullets?.review?.length ? llmBullets.review : fallbackBullets.review,
		screenshot: llmBullets?.screenshot?.length ? llmBullets.screenshot : fallbackBullets.screenshot,
	};
	const counters = new Map<Exclude<TemplateSection, null>, number>();
	const lines = template.split(/\r?\n/);
	const out: string[] = [];
	let section: TemplateSection = null;

	for (const line of lines) {
		const headingMatch = line.match(/^\s*#{2,3}\s+(.+?)\s*$/);
		if (headingMatch) {
			section = detectTemplateSection(headingMatch[1]!);
			out.push(line);
			continue;
		}

		if (/^\s*-\s*$/.test(line) && section) {
			const sectionBullets = bullets[section];
			const idx = counters.get(section) ?? 0;
			if (idx < sectionBullets.length) {
				for (let j = idx; j < sectionBullets.length; j++) {
					out.push(`- ${sectionBullets[j]}`);
				}
				counters.set(section, sectionBullets.length);
				continue;
			}
			continue;
		}

		if (section === "screenshot" && /^\|\s*\|\s*\|\s*$/.test(line)) {
			out.push(bullets.screenshot[0] ?? line);
			continue;
		}

		out.push(line);
	}

	return out.join("\n");
}

async function listCommitFiles(repoPath: string, headSha: string): Promise<string[]> {
	const result = await Bun.$`git -C ${repoPath} ls-tree -r --name-only ${headSha}`.quiet().nothrow();
	if (result.exitCode !== 0) return [];
	return result.stdout
		.toString()
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function collectTemplateCandidates(files: string[]): string[] {
	const preferred = files
		.filter((path) => TEMPLATE_DIR_RE.test(path))
		.sort((a, b) => a.localeCompare(b));

	const combined = [...PR_TEMPLATE_PATHS, ...preferred];
	const deduped: string[] = [];
	for (const path of combined) {
		if (!deduped.includes(path)) deduped.push(path);
	}
	return deduped;
}

async function readPrTemplate(repoPath: string, headSha: string): Promise<PrTemplateData | null> {
	const commitFiles = await listCommitFiles(repoPath, headSha);
	const candidates = collectTemplateCandidates(commitFiles);
	for (const path of candidates) {
		const result = await Bun.$`git -C ${repoPath} show ${headSha}:${path}`.quiet().nothrow();
		if (result.exitCode === 0) {
			const content = result.stdout.toString().trim();
			if (content) return { path, content };
		}
	}
	return null;
}

async function runWithBodyFile<T>(body: string, fn: (filePath: string) => Promise<T>): Promise<T> {
	const filePath = `/tmp/newpr-pr-body-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.md`;
	await Bun.write(filePath, body);
	try {
		return await fn(filePath);
	} finally {
		await Bun.$`rm -f ${filePath}`.quiet().nothrow();
	}
}

export async function publishStack(input: PublishInput): Promise<StackPublishResult> {
	const { repo_path, exec_result, pr_meta, base_branch, owner, repo, plan_groups, llm_client, language, publish_preview } = input;
	const ghRepo = `${owner}/${repo}`;
	const groupMetaById = buildGroupMetaMap(plan_groups);
	const effectiveGroups = buildEffectiveGroupMeta(exec_result, groupMetaById);
	const reusablePreview = isPreviewCompatible(exec_result, publish_preview) ? publish_preview : null;
	const previewByGroup = new Map((reusablePreview?.items ?? []).map((item) => [item.group_id, item]));

	const headSha = exec_result.group_commits.at(-1)?.commit_sha ?? "HEAD";
	const prTemplateData = await readPrTemplate(repo_path, headSha);
	const prTemplate = prTemplateData?.content ?? null;
	const llmPrefillByGroup = previewByGroup.size > 0
		? new Map<string, SectionBullets>()
		: await generateTemplatePrefillWithLlm(
			llm_client,
			pr_meta,
			effectiveGroups,
			prTemplate ?? "",
			language,
		);

	const branches: BranchInfo[] = [];
	const prs: PrInfo[] = [];
	const total = exec_result.group_commits.length;

	const branchByGroupId = new Map(exec_result.group_commits.map((gc) => [gc.group_id, gc.branch_name]));

	const resolvePrBase = (gc: typeof exec_result.group_commits[number], index: number): string => {
		const planGroup = plan_groups?.find((g) => g.id === gc.group_id);
		const directDeps: string[] = planGroup?.deps ?? [];
		if (directDeps.length > 0) {
			const depBranch = directDeps
				.map((dep: string) => branchByGroupId.get(dep))
				.find((b: string | undefined): b is string => Boolean(b));
			if (depBranch) return depBranch;
		}
		return index === 0 ? base_branch : (exec_result.group_commits[index - 1]?.branch_name ?? base_branch);
	};

	for (const gc of exec_result.group_commits) {
		const pushResult = await Bun.$`git -C ${repo_path} push origin refs/heads/${gc.branch_name}:refs/heads/${gc.branch_name} --force-with-lease`.quiet().nothrow();

		branches.push({
			name: gc.branch_name,
			pushed: pushResult.exitCode === 0,
		});

		if (pushResult.exitCode !== 0) {
			continue;
		}
	}

	for (let i = 0; i < exec_result.group_commits.length; i++) {
		const gc = exec_result.group_commits[i];
		if (!gc) continue;
		const groupMeta = groupMetaById.get(gc.group_id);

		const branchInfo = branches.find((b) => b.name === gc.branch_name);
		if (!branchInfo?.pushed) continue;

		const previewItem = previewByGroup.get(gc.group_id);
		const prBase = previewItem?.base_branch ?? resolvePrBase(gc, i);
		if (!prBase) continue;

		const order = i + 1;
		const title = previewItem?.title ?? buildStackPrTitle(gc, pr_meta, order, total);

		const placeholder = previewItem?.body ?? buildPlaceholderBody(
			gc.group_id,
			order,
			total,
			pr_meta,
			prTemplate,
			groupMeta,
			prBase,
			gc.branch_name,
			llmPrefillByGroup.get(gc.group_id),
		);

		const prResult = await runWithBodyFile(
			placeholder,
			(filePath) => Bun.$`gh pr create --repo ${ghRepo} --base ${prBase} --head ${gc.branch_name} --title ${title} --body-file ${filePath} --draft`.quiet().nothrow(),
		);

		if (prResult.exitCode === 0) {
			const prUrl = prResult.stdout.toString().trim();
			const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);

			prs.push({
				group_id: gc.group_id,
				number: prNumberMatch ? parseInt(prNumberMatch[1]!, 10) : 0,
				url: prUrl,
				title,
				base_branch: prBase,
				head_branch: gc.branch_name,
			});
		} else {
			const stderr = prResult.stderr.toString().trim();
			console.error(`[publish] gh pr create failed for ${gc.group_id}: ${stderr}`);
		}
	}

	await updatePrBodies(ghRepo, prs, pr_meta, prTemplate, groupMetaById, llmPrefillByGroup, previewByGroup);
	await postStackNavigationComments(ghRepo, prs);

	return { branches, prs };
}

export async function buildStackPublishPreview(input: PublishInput): Promise<StackPublishPreviewResult> {
	const { repo_path, exec_result, pr_meta, base_branch, plan_groups, llm_client, language } = input;
	const headSha = exec_result.group_commits.at(-1)?.commit_sha ?? "HEAD";
	const prTemplateData = await readPrTemplate(repo_path, headSha);
	const prTemplate = prTemplateData?.content ?? null;
	const total = exec_result.group_commits.length;
	const groupMetaById = buildGroupMetaMap(plan_groups);
	const effectiveGroups = buildEffectiveGroupMeta(exec_result, groupMetaById);
	const llmPrefillByGroup = await generateTemplatePrefillWithLlm(
		llm_client,
		pr_meta,
		effectiveGroups,
		prTemplate ?? "",
		language,
	);

	const items = exec_result.group_commits.map((gc, i) => {
		const order = i + 1;
		const title = buildStackPrTitle(gc, pr_meta, order, total);
		const prBase = i === 0 ? base_branch : exec_result.group_commits[i - 1]?.branch_name ?? base_branch;
		const groupMeta = groupMetaById.get(gc.group_id);
		return {
			group_id: gc.group_id,
			title,
			base_branch: prBase,
			head_branch: gc.branch_name,
			order,
			total,
			body: buildDescriptionBody(
				gc.group_id,
				order,
				total,
				pr_meta,
				prTemplate,
				groupMeta,
				prBase,
				gc.branch_name,
				llmPrefillByGroup.get(gc.group_id),
			),
		};
	});

	return {
		template_path: prTemplateData?.path ?? null,
		items,
	};
}

async function updatePrBodies(
	ghRepo: string,
	prs: PrInfo[],
	prMeta: PrMeta,
	prTemplate: string | null,
	groupMetaById: Map<string, StackPublishGroupMeta>,
	llmPrefillByGroup: Map<string, SectionBullets>,
	previewByGroup: Map<string, StackPublishPreviewItem>,
): Promise<void> {
	if (prs.length === 0) return;

	for (let i = 0; i < prs.length; i++) {
		const pr = prs[i]!;
		const previewItem = previewByGroup.get(pr.group_id);
		const previewBody = previewItem?.body;
		const groupMeta = groupMetaById.get(pr.group_id);
		const body = previewBody ?? buildFullBody(
			pr,
			i,
			prs,
			prMeta,
			prTemplate,
			groupMeta,
			pr.base_branch,
			pr.head_branch,
			llmPrefillByGroup.get(pr.group_id),
		);
		const editResult = await runWithBodyFile(
			body,
			(filePath) => Bun.$`gh pr edit ${pr.number} --repo ${ghRepo} --body-file ${filePath}`.quiet().nothrow(),
		);
		if (editResult.exitCode !== 0) {
			const stderr = editResult.stderr.toString().trim();
			console.error(`[publish] gh pr edit failed for #${pr.number} (${pr.group_id}): ${stderr}`);
		}
	}
}

async function postStackNavigationComments(ghRepo: string, prs: PrInfo[]): Promise<void> {
	if (prs.length === 0) return;

	for (let i = 0; i < prs.length; i++) {
		const pr = prs[i]!;
		const alreadyPosted = await hasStackNavigationComment(ghRepo, pr.number);
		if (alreadyPosted) continue;

		const comment = buildStackNavigationComment(i, prs);
		const commentResult = await runWithBodyFile(
			comment,
			(filePath) => Bun.$`gh pr comment ${pr.number} --repo ${ghRepo} --body-file ${filePath}`.quiet().nothrow(),
		);
		if (commentResult.exitCode !== 0) {
			const stderr = commentResult.stderr.toString().trim();
			console.error(`[publish] gh pr comment failed for #${pr.number} (${pr.group_id}): ${stderr}`);
		}
	}
}

async function hasStackNavigationComment(ghRepo: string, prNumber: number): Promise<boolean> {
	const viewResult = await Bun.$`gh pr view ${prNumber} --repo ${ghRepo} --json comments`.quiet().nothrow();
	if (viewResult.exitCode !== 0) return false;

	try {
		const payload = JSON.parse(viewResult.stdout.toString()) as { comments?: Array<{ body?: string }> };
		return (payload.comments ?? []).some((comment) => comment.body?.includes(STACK_NAV_COMMENT_MARKER));
	} catch {
		return false;
	}
}

function buildPlaceholderBody(
	groupId: string,
	order: number,
	total: number,
	prMeta: PrMeta,
	prTemplate: string | null,
	groupMeta?: StackPublishGroupMeta,
	baseBranch?: string,
	headBranch?: string,
	llmBullets?: SectionBullets,
): string {
	return buildDescriptionBody(groupId, order, total, prMeta, prTemplate, groupMeta, baseBranch, headBranch, llmBullets);
}

function buildStackPrTitle(
	groupCommit: StackExecResult["group_commits"][number],
	prMeta: PrMeta,
	order: number,
	total: number,
): string {
	const stackPrefix = `[PR#${prMeta.pr_number} ${order}/${total}]`;
	return groupCommit.pr_title
		? `${stackPrefix} ${groupCommit.pr_title}`
		: `${stackPrefix} ${groupCommit.group_id}`;
}

function buildDescriptionBody(
	groupId: string,
	order: number,
	total: number,
	prMeta: PrMeta,
	prTemplate: string | null,
	groupMeta?: StackPublishGroupMeta,
	baseBranch?: string,
	headBranch?: string,
	llmBullets?: SectionBullets,
): string {
	const lines = [
		`> **Stack ${order}/${total}** — This PR is part of a stacked PR chain created by [newpr](https://github.com/jiwonMe/newpr).`,
		`> Source: #${prMeta.pr_number} ${prMeta.pr_title}`,
		`> Stack navigation is posted as a discussion comment.`,
		``,
		`---`,
		``,
		`## ${groupId}`,
		``,
		`*From PR [#${prMeta.pr_number}](${prMeta.pr_url}): ${prMeta.pr_title}*`,
	];

	if (prTemplate) {
		const hydratedTemplate = fillTemplatePlaceholders(prTemplate, {
			groupId,
			order,
			total,
			prMeta,
			groupMeta,
			baseBranch,
			headBranch,
			template: prTemplate,
		}, llmBullets);
		lines.push("", "---", "", hydratedTemplate);
	}

	return lines.join("\n");
}

function buildFullBody(
	current: PrInfo,
	index: number,
	allPrs: PrInfo[],
	prMeta: PrMeta,
	prTemplate: string | null,
	groupMeta?: StackPublishGroupMeta,
	baseBranch?: string,
	headBranch?: string,
	llmBullets?: SectionBullets,
): string {
	return buildDescriptionBody(current.group_id, index + 1, allPrs.length, prMeta, prTemplate, groupMeta, baseBranch, headBranch, llmBullets);
}

function buildStackNavigationComment(index: number, allPrs: PrInfo[]): string {
	const total = allPrs.length;
	const order = index + 1;

	const stackTable = allPrs.map((pr, i) => {
		const num = i + 1;
		const isCurrent = i === index;
		const marker = isCurrent ? "👉" : statusEmoji(i, index);
		const link = `[#${pr.number}](${pr.url})`;
		const titleText = pr.title.replace(/^\[(?:PR#\d+\s+\d+\/\d+|Stack\s+\d+\/\d+|\d+\/\d+)\]\s*/i, "");
		return `| ${marker} | ${num}/${total} | ${link} | ${titleText} |`;
	}).join("\n");

	const prev = index > 0
		? `⬅️ Previous: [#${allPrs[index - 1]!.number}](${allPrs[index - 1]!.url})`
		: "⬅️ Previous: base branch";
	const next = index < total - 1
		? `➡️ Next: [#${allPrs[index + 1]!.number}](${allPrs[index + 1]!.url})`
		: "➡️ Next: top of stack";

	return [
		STACK_NAV_COMMENT_MARKER,
		`### 📚 Stack Navigation (${order}/${total})`,
		``,
		`| | Order | PR | Title |`,
		`|---|---|---|---|`,
		stackTable,
		``,
		`${prev} | ${next}`,
		``,
		`_Posted by newpr during stack publish._`,
	].join("\n");
}

function statusEmoji(prIndex: number, currentIndex: number): string {
	if (prIndex < currentIndex) return "✅";
	return "⬜";
}
