export async function getGithubToken(): Promise<string> {
	const envToken = process.env.GITHUB_TOKEN;
	if (envToken) return envToken;

	try {
		const result = await Bun.$`gh auth token`.text();
		const token = result.trim();
		if (token) return token;
	} catch {
		// intentionally empty: fall through to error below
	}

	throw new Error(
		"GitHub token not found. Either set GITHUB_TOKEN env var or run `gh auth login`.",
	);
}
