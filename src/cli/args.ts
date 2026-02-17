export interface CliArgs {
	command: "review" | "auth" | "help" | "version";
	prInput?: string;
	repo?: string;
	model?: string;
	output: "json" | "pretty";
	verbose: boolean;
	subArgs: string[];
}

function printHelp(): void {
	const help = `
newpr - AI-powered large PR review tool

Usage:
  newpr review <pr-url-or-number> [options]
  newpr auth [--key <api-key>]
  newpr auth status
  newpr auth logout
  newpr help
  newpr version

Examples:
  newpr auth                           # interactive: prompts for key
  newpr auth --key sk-or-xxx           # non-interactive: set key directly
  newpr auth status                    # show current auth state
  newpr auth logout                    # remove stored key
  newpr review https://github.com/owner/repo/pull/123
  newpr review owner/repo#123
  newpr review 123 --repo owner/repo
  newpr review #123 --repo owner/repo --output pretty

Options:
  --repo <owner/repo>   Repository (required when using PR number only)
  --model <model>       Override LLM model (default: anthropic/claude-sonnet-4)
  --output <format>     Output format: json (default) | pretty
  --verbose             Show progress on stderr
  -h, --help            Show this help
  -v, --version         Show version

Environment Variables:
  OPENROUTER_API_KEY    Required. Your OpenRouter API key.
  GITHUB_TOKEN          Optional. Falls back to gh CLI token.
  NEWPR_MODEL           Default model override.
  NEWPR_MAX_FILES       Max files to analyze (default: 100).
  NEWPR_TIMEOUT         Timeout per LLM call in seconds (default: 120).
  NEWPR_CONCURRENCY     Parallel LLM calls (default: 5).
`.trim();

	console.log(help);
}

const DEFAULTS = { output: "json" as const, verbose: false, subArgs: [] as string[] };

export function parseArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);

	if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
		printHelp();
		return { command: "help", ...DEFAULTS };
	}

	if (args.includes("-v") || args.includes("--version")) {
		return { command: "version", ...DEFAULTS };
	}

	const command = args[0];

	if (command === "version") {
		return { command: "version", ...DEFAULTS };
	}
	if (command === "help") {
		printHelp();
		return { command: "help", ...DEFAULTS };
	}
	if (command === "auth") {
		return { command: "auth", ...DEFAULTS, subArgs: args.slice(1) };
	}
	if (command !== "review") {
		console.error(`Unknown command: ${command}\n`);
		printHelp();
		return { command: "help", ...DEFAULTS };
	}

	const prInput = args[1];
	if (!prInput || prInput.startsWith("-")) {
		console.error("Error: PR URL or number is required.\n");
		printHelp();
		process.exit(1);
	}

	let repo: string | undefined;
	let model: string | undefined;
	let output: "json" | "pretty" = "json";
	let verbose = false;

	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--repo":
				repo = args[++i];
				break;
			case "--model":
				model = args[++i];
				break;
			case "--output":
				output = args[++i] === "pretty" ? "pretty" : "json";
				break;
			case "--verbose":
				verbose = true;
				break;
		}
	}

	return { command: "review", prInput, repo, model, output, verbose, subArgs: [] };
}
