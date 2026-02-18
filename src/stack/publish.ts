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

export async function publishStack(input: PublishInput): Promise<StackPublishResult> {
	const { repo_path, exec_result, pr_meta, base_branch, owner, repo } = input;
	const ghRepo = `${owner}/${repo}`;

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

		const body = buildPrBody(gc.group_id, order, total, exec_result, pr_meta);

		const prResult = await Bun.$`gh pr create --repo ${ghRepo} --base ${prBase} --head ${gc.branch_name} --title ${title} --body ${body} --draft`.quiet().nothrow();

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

	return { branches, prs };
}

function buildPrBody(
	groupId: string,
	order: number,
	total: number,
	_execResult: StackExecResult,
	prMeta: PrMeta,
): string {
	const prevPr = order > 1 ? `Previous: Stack ${order - 1}/${total}` : "Previous: (base branch)";
	const nextPr = order < total ? `Next: Stack ${order + 1}/${total}` : "Next: (top of stack)";

	const lines = [
		`> This is part of a stacked PR chain created by [newpr](${prMeta.pr_url})`,
		`>`,
		`> **Stack order**: ${order}/${total}`,
		`> **${prevPr}** | **${nextPr}**`,
		``,
		`## ${groupId}`,
		``,
		`*From PR #${prMeta.pr_number}: ${prMeta.pr_title}*`,
	];

	return lines.join("\n");
}
