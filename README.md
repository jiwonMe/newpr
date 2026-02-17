# newpr

AI-powered PR review tool for understanding large pull requests with 1000+ lines of changes.

newpr fetches a GitHub PR, optionally clones the repo for deep codebase exploration using an agentic coding tool, then uses an LLM to produce a structured analysis: file summaries, logical groupings, an overall summary, and a narrative walkthrough with clickable cross-references.

## Features

- **Narrative walkthrough** — reads like an article, with `[[group:...]]` and `[[file:...]]` cross-references
- **Logical grouping** — clusters changed files by purpose (feature, refactor, bugfix, etc.)
- **Codebase exploration** — uses Claude Code / OpenCode / Codex to analyze the actual repository, not just the diff
- **Interactive TUI** — Ink-based terminal UI with tabbed panels, slash commands, ASCII logo
- **Web UI** — browser-based interface with sidebar, resizable panels, markdown rendering, dark/light mode
- **Streaming progress** — real-time SSE streaming of analysis steps
- **Session history** — saves past analyses for instant recall
- **Multi-language** — output in any language (auto-detected or configured)

## Quick Start

```bash
bun install
```

### Option A: OpenRouter API key

```bash
export OPENROUTER_API_KEY=sk-or-...
newpr https://github.com/owner/repo/pull/123
```

### Option B: Claude Code (no API key needed)

If you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed, newpr uses it as a fallback when no OpenRouter API key is set — for both LLM analysis and codebase exploration.

```bash
newpr https://github.com/owner/repo/pull/123
```

### Web UI

```bash
newpr --web --port 3000
```

Opens a browser-based UI at `http://localhost:3000` with:
- Left sidebar with session history
- Resizable detail panel on the right
- Clickable group/file anchors in the narrative
- Settings modal for model, agent, language configuration
- GitHub profile integration

## Usage

```
newpr                                # launch interactive shell
newpr <pr-url>                       # shell with PR pre-loaded
newpr --web [--port 3000]            # launch web UI
newpr review <pr-url> --json         # non-interactive JSON output
newpr history                        # list past review sessions
newpr auth [--key <api-key>]         # configure API key
```

### Review mode options

```
--repo <owner/repo>   Repository (when using PR number only)
--model <model>       Override LLM model (default: anthropic/claude-sonnet-4.5)
--agent <tool>        Preferred agent: claude | opencode | codex (default: auto)
--no-clone            Skip git clone, diff-only analysis (faster, less context)
--json                Output raw JSON
--stream-json         Stream progress as NDJSON, then emit result
--verbose             Show progress on stderr
```

### PR input formats

```bash
newpr https://github.com/owner/repo/pull/123
newpr owner/repo#123
newpr review 123 --repo owner/repo
```

## Architecture

```
src/
├── cli/          # CLI entry, arg parsing, auth, history commands
├── config/       # Config loading (~/.newpr/config.json)
├── github/       # GitHub API (fetch PR data, diff, parse URL)
├── diff/         # Unified diff parser + chunker
├── llm/          # LLM clients (OpenRouter + Claude Code fallback), prompts, response parser
├── analyzer/     # Pipeline orchestrator + progress events
├── workspace/    # Agent system (claude/opencode/codex), git operations, codebase exploration
├── types/        # Shared TypeScript types
├── history/      # Session persistence (~/.newpr/history/)
├── tui/          # Ink TUI (shell, panels, theme, slash commands)
└── web/          # Web UI
    ├── server.ts           # Bun.serve() with Tailwind CSS build
    ├── server/             # REST API + SSE endpoints, session manager
    ├── client/             # React frontend
    │   ├── components/     # AppShell, ResultsScreen, Markdown, DetailPane, etc.
    │   ├── panels/         # Story, Summary, Groups, Files, Narrative
    │   └── hooks/          # useAnalysis, useSessions, useTheme, useGithubUser
    └── styles/             # Tailwind v4 + Pretendard font
```

## Analysis Pipeline

1. **Fetch** — PR metadata, commits, and diff from GitHub API
2. **Parse** — unified diff into per-file chunks
3. **Clone** — bare repo clone with worktree checkout (cached)
4. **Explore** — 3-phase codebase exploration via agentic tool (structure → related code → issues)
5. **Analyze** — LLM summarizes each file chunk in parallel batches
6. **Group** — LLM clusters files into logical groups with types
7. **Summarize** — LLM generates purpose, scope, impact, risk level
8. **Narrate** — LLM writes a walkthrough article with cross-references

## LLM Backend

newpr supports two LLM backends:

| Backend | Setup | Use case |
|---------|-------|----------|
| **OpenRouter** | Set `OPENROUTER_API_KEY` | Full model selection (Claude, GPT-4, Gemini, etc.) |
| **Claude Code** | Install `claude` CLI | Zero-config fallback, uses your existing Claude subscription |

When no OpenRouter API key is configured, newpr automatically falls back to Claude Code for all LLM calls.

## Codebase Exploration Agents

For deep analysis beyond the diff, newpr uses an agentic coding tool to explore the actual repository:

| Agent | Command | Detection |
|-------|---------|-----------|
| Claude Code | `claude` | `which claude` |
| OpenCode | `opencode` | `which opencode` |
| Codex | `codex` | `which codex` |

The agent runs 3 exploration phases:
1. **Structure** — project type, key directories, architecture pattern
2. **Related code** — imports, usages, test coverage for changed files
3. **Issues** — breaking changes, missing error handling, inconsistencies

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No* | OpenRouter API key (*falls back to Claude Code) |
| `GITHUB_TOKEN` | No | GitHub token (falls back to `gh` CLI) |
| `NEWPR_MODEL` | No | Default model (default: `anthropic/claude-sonnet-4.5`) |
| `NEWPR_MAX_FILES` | No | Max files to analyze (default: 100) |
| `NEWPR_TIMEOUT` | No | Timeout per LLM call in seconds (default: 120) |
| `NEWPR_CONCURRENCY` | No | Parallel LLM calls (default: 5) |

## Config File

Persistent settings are stored in `~/.newpr/config.json`:

```json
{
  "openrouter_api_key": "sk-or-...",
  "model": "anthropic/claude-sonnet-4.5",
  "language": "auto",
  "agent": "claude",
  "max_files": 100,
  "timeout": 120,
  "concurrency": 5
}
```

## Development

```bash
bun install
bun test              # run tests (91 tests)
bun run typecheck     # tsc --noEmit
bun run lint          # biome check
bun run start         # launch CLI
```

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- GitHub CLI (`gh`) for authentication, or `GITHUB_TOKEN`
- One of: `OPENROUTER_API_KEY` or Claude Code (`claude` CLI)

## License

Private
