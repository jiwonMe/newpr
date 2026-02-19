import type { StackExecResult, StackPublishResult, BranchInfo, PrInfo } from "./types.ts";
import type { PrMeta } from "../types/output.ts";

export interface PublishInput {
	repo_path: string;
	exec_result: StackExecResult;
	pr_meta: PrMeta;
	base_branch: string;
	owner: string;
	repo: string;
}

const PR_TEMPLATE_PATHS = [
	".github/PULL_REQUEST_TEMPLATE.md",
	".github/pull_request_template.md",
	".github/PULL_REQUEST_TEMPLATE",
	"PULL_REQUEST_TEMPLATE.md",
	"PULL_REQUEST_TEMPLATE",
	"docs/PULL_REQUEST_TEMPLATE.md",
	"docs/pull_request_template.md",
];

async function readPrTemplate(repoPath: string, headSha: string): Promise<string | null> {
	for (const path of PR_TEMPLATE_PATHS) {
		const result = await Bun.$`git -C ${repoPath} show ${headSha}:${path}`.quiet().nothrow();
		if (result.exitCode === 0) {
			const content = result.stdout.toString().trim();
			if (content) return content;
		}
	}
	return null;
}

export async function publishStack(input: PublishInput): Promise<StackPublishResult> {
	const { repo_path, exec_result, pr_meta, base_branch, owner, repo } = input;
	const ghRepo = `${owner}/${repo}`;

	const headSha = exec_result.group_commits.at(-1)?.commit_sha ?? "HEAD";
	const prTemplate = await readPrTemplate(repo_path, headSha);

	const branches: BranchInfo[] = [];
	const prs: PrInfo[] = [];
	const total = exec_result.group_commits.length;

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

		const branchInfo = branches.find((b) => b.name === gc.branch_name);
		if (!branchInfo?.pushed) continue;

		const prBase = i === 0 ? base_branch : exec_result.group_commits[i - 1]?.branch_name;
		if (!prBase) continue;

		const order = i + 1;
		const title = gc.pr_title
			? `[${order}/${total}] ${gc.pr_title}`
			: `[Stack ${order}/${total}] ${gc.group_id}`;

		const placeholder = buildPlaceholderBody(gc.group_id, order, total, pr_meta);

		const prResult = await Bun.$`gh pr create --repo ${ghRepo} --base ${prBase} --head ${gc.branch_name} --title ${title} --body ${placeholder} --draft`.quiet().nothrow();

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

	await updatePrBodies(ghRepo, prs, pr_meta, prTemplate);

	return { branches, prs };
}

async function updatePrBodies(ghRepo: string, prs: PrInfo[], prMeta: PrMeta, prTemplate: string | null): Promise<void> {
	if (prs.length === 0) return;

	for (let i = 0; i < prs.length; i++) {
		const pr = prs[i]!;
		const body = buildFullBody(pr, i, prs, prMeta, prTemplate);

		await Bun.$`gh pr edit ${pr.number} --repo ${ghRepo} --body ${body}`.quiet().nothrow();
	}
}

function buildPlaceholderBody(
	groupId: string,
	order: number,
	total: number,
	prMeta: PrMeta,
): string {
	return [
		`> This is part of a stacked PR chain created by [newpr](https://github.com/jiwonMe/newpr).`,
		`> Stack order: ${order}/${total} — body will be updated with links shortly.`,
		``,
		`## ${groupId}`,
		``,
		`*From PR #${prMeta.pr_number}: ${prMeta.pr_title}*`,
	].join("\n");
}

function buildFullBody(
	current: PrInfo,
	index: number,
	allPrs: PrInfo[],
	prMeta: PrMeta,
	prTemplate: string | null,
): string {
	const total = allPrs.length;
	const order = index + 1;

	const stackTable = allPrs.map((pr, i) => {
		const num = i + 1;
		const isCurrent = i === index;
		const marker = isCurrent ? "👉" : statusEmoji(i, index);
		const link = `[#${pr.number}](${pr.url})`;
		const titleText = pr.title.replace(/^\[\d+\/\d+\]\s*/, "");
		return `| ${marker} | ${num}/${total} | ${link} | ${titleText} |`;
	}).join("\n");

	const prev = index > 0
		? `⬅️ Previous: [#${allPrs[index - 1]!.number}](${allPrs[index - 1]!.url})`
		: "⬅️ Previous: base branch";
	const next = index < total - 1
		? `➡️ Next: [#${allPrs[index + 1]!.number}](${allPrs[index + 1]!.url})`
		: "➡️ Next: top of stack";

	const lines = [
		`> **Stack ${order}/${total}** — This PR is part of a stacked PR chain created by [newpr](https://github.com/jiwonMe/newpr).`,
		`> Source: #${prMeta.pr_number} ${prMeta.pr_title}`,
		``,
		`### 📚 Stack Navigation`,
		``,
		`| | Order | PR | Title |`,
		`|---|---|---|---|`,
		stackTable,
		``,
		`${prev} | ${next}`,
		``,
		`---`,
		``,
		`## ${current.group_id}`,
		``,
		`*From PR [#${prMeta.pr_number}](${prMeta.pr_url}): ${prMeta.pr_title}*`,
	];

	if (prTemplate) {
		lines.push(``, `---`, ``, prTemplate);
	}

	return lines.join("\n");
}

function statusEmoji(prIndex: number, currentIndex: number): string {
	if (prIndex < currentIndex) return "✅";
	return "⬜";
}
