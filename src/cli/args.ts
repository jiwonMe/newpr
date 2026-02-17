import type { AgentToolName } from "../workspace/types.ts";

export interface CliArgs {
	command: "shell" | "review" | "auth" | "history" | "help" | "version";
	prInput?: string;
	repo?: string;
	model?: string;
	output: "tui" | "json" | "stream-json" | "pretty";
	verbose: boolean;
	noClone: boolean;
	agent?: AgentToolName;
	subArgs: string[];
}

function printHelp(): void {
	const help = `
newpr - AI-powered large PR review tool

Usage:
  newpr                                # launch interactive shell
  newpr <pr-url>                       # launch shell with PR pre-loaded
  newpr review <pr-url> --json         # non-interactive JSON output
  newpr history                        # list past review sessions
  newpr history show <id>              # show full JSON for a session
  newpr history clear                  # clear all history
  newpr auth [--key <api-key>]
  newpr auth status
  newpr auth logout
  newpr help
  newpr version

Examples:
  newpr                                            # interactive shell
  newpr https://github.com/owner/repo/pull/123     # shell + auto-analyze
  newpr review owner/repo#123 --json               # pipe-friendly JSON
  newpr review 123 --repo owner/repo --no-clone    # diff-only (no git clone)
  newpr auth --key sk-or-xxx

Options (review mode):
  --repo <owner/repo>   Repository (required when using PR number only)
  --model <model>       Override LLM model (default: anthropic/claude-sonnet-4.5)
  --agent <tool>        Preferred agent: claude | opencode | codex (default: auto)
  --no-clone            Skip git clone, diff-only analysis (faster, less context)
  --json                Output raw JSON (for piping/scripting)
  --stream-json         Stream progress as NDJSON, then emit result
  --output <format>     Output format: tui (default) | json | stream-json | pretty
  --verbose             Show progress on stderr (non-TUI modes)
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

const DEFAULTS = { output: "tui" as const, verbose: false, noClone: false, subArgs: [] as string[] };

function looksLikePrInput(s: string): boolean {
	return (
		s.startsWith("http://") ||
		s.startsWith("https://") ||
		s.includes("#") ||
		/^\d+$/.test(s) ||
		/^[^/]+\/[^/]+#\d+$/.test(s)
	);
}

function parseAgentName(val: string | undefined): AgentToolName | undefined {
	if (val === "claude" || val === "opencode" || val === "codex") return val;
	return undefined;
}

export function parseArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);

	if (args.includes("-h") || args.includes("--help")) {
		printHelp();
		return { command: "help", ...DEFAULTS };
	}

	if (args.includes("-v") || args.includes("--version")) {
		return { command: "version", ...DEFAULTS };
	}

	if (args.length === 0) {
		return { command: "shell", ...DEFAULTS };
	}

	const command = args[0]!;

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
	if (command === "history") {
		return { command: "history", ...DEFAULTS, subArgs: args.slice(1) };
	}

	if (command === "review") {
		return parseReviewArgs(args.slice(1));
	}

	if (looksLikePrInput(command)) {
		return { command: "shell", prInput: command, ...DEFAULTS };
	}

	console.error(`Unknown command: ${command}\n`);
	printHelp();
	return { command: "help", ...DEFAULTS };
}

function parseReviewArgs(args: string[]): CliArgs {
	const prInput = args[0];
	if (!prInput || prInput.startsWith("-")) {
		console.error("Error: PR URL or number is required.\n");
		printHelp();
		process.exit(1);
	}

	let repo: string | undefined;
	let model: string | undefined;
	let agent: AgentToolName | undefined;
	let output: "tui" | "json" | "stream-json" | "pretty" = "tui";
	let verbose = false;
	let noClone = false;

	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--repo":
				repo = args[++i];
				break;
			case "--model":
				model = args[++i];
				break;
			case "--agent":
				agent = parseAgentName(args[++i]);
				break;
			case "--no-clone":
				noClone = true;
				break;
			case "--json":
				output = "json";
				break;
			case "--stream-json":
				output = "stream-json";
				break;
			case "--output": {
				const val = args[++i];
				if (val === "json") output = "json";
				else if (val === "stream-json") output = "stream-json";
				else if (val === "pretty") output = "pretty";
				else output = "tui";
				break;
			}
			case "--verbose":
				verbose = true;
				break;
		}
	}

	return { command: "review", prInput, repo, model, agent, output, verbose, noClone, subArgs: [] };
}
