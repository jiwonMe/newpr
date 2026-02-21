# newpr

AI-powered PR review tool that turns large pull requests into readable, navigable stories.

## Quick Install

```bash
bunx newpr --web
```

Or install globally:

```bash
bun add -g newpr
newpr --web
```

The web UI opens automatically at `http://localhost:3456`. Paste any GitHub PR URL to start.

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- [GitHub CLI](https://cli.github.com) — `brew install gh && gh auth login`
- One of:
  - `OPENROUTER_API_KEY` — for model selection (Claude, GPT-4, Gemini, etc.)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — zero-config fallback
- [Codex CLI](https://www.npmjs.com/package/@openai/codex) — alternative zero‑config option

```bash
# Option A: OpenRouter
export OPENROUTER_API_KEY=sk-or-...
newpr --web

# Option B: Claude Code (no API key needed)
newpr --web
```

## What it Does

newpr fetches a GitHub PR, clones the repo for deep codebase exploration using an agentic coding tool (Claude Code / OpenCode / Codex), then produces:

- **Narrative walkthrough** — prose-first story with clickable code references that open diffs at the exact line
- **Logical grouping** — clusters files by purpose (feature, refactor, bugfix) with key changes, risk assessment, and dependency mapping
- **Interactive chat** — ask follow-up questions with agentic tool execution (file diffs, GitHub API, web search)
- **Inline diff comments** — create/edit/delete review comments synced to GitHub
- **PR actions** — approve, request changes, or comment directly from the UI
- **React Doctor** — auto-runs [react-doctor](https://github.com/millionco/react-doctor) on React projects for code quality scoring

### Anchors & Navigation

Every analysis is densely linked. The narrative contains three types of clickable references:

| Anchor | Appearance | Action |
|--------|------------|--------|
| `[[group:Name]]` | Blue chip | Opens group detail in sidebar |
| `[[file:path]]` | Blue chip | Opens file diff in sidebar |
| `[[line:path#L-L]](text)` | Subtle underline | Opens diff scrolled to line, highlights range |

## Usage

```bash
newpr                                 # interactive shell (TUI)
newpr <pr-url>                        # shell with PR pre-loaded
newpr --web [--port 3456]             # web UI (default)
newpr --web --cartoon                 # web UI with comic strip generation
newpr review <pr-url> --json          # non-interactive JSON output
newpr history                         # list past sessions
newpr auth [--key <api-key>]          # configure API key
```

### Options

```
--model <model>       LLM model (default: anthropic/claude-sonnet-4.6)
--agent <tool>        Preferred agent: claude | opencode | codex (default: auto)
--port <port>         Web UI port (default: 3456)
--cartoon             Enable comic strip generation
--no-clone            Skip git clone, diff-only analysis
--json                Output raw JSON
--stream-json         Stream progress as NDJSON
--verbose             Show progress on stderr
```

### PR Input Formats

```bash
newpr https://github.com/owner/repo/pull/123
newpr owner/repo#123
newpr review 123 --repo owner/repo
```

## Web UI

The web interface provides:

- **Sidebar** — sessions grouped by repository, background analysis tracking
- **Story tab** — narrative with inline line anchors + chat input at bottom
- **Discussion tab** — PR description + GitHub comments
- **Groups tab** — collapsible change groups with key changes and risk
- **Files tab** — tree/group/changes view modes with inline summaries
- **Comic tab** — AI-generated 4-panel comic strip (with `--cartoon`)
- **Right sidebar** — file diffs with syntax highlighting, inline comments, line highlighting
- **TipTap editor** — `@` to reference files/groups, `/` for commands
- **KaTeX** — LaTeX math rendering in chat and narrative
- **Review modal** — approve, request changes, or comment via GitHub API
- **Settings** — model, agent, language, API keys
- **Preflight checks** — system health (gh, agents, API key) on startup

## Chat

The chat in the Story tab supports agentic tool execution:

| Tool | Description |
|------|-------------|
| `get_file_diff` | Fetch unified diff for a specific file |
| `list_files` | List all changed files with summaries |
| `get_pr_comments` | Fetch PR discussion comments |
| `get_review_comments` | Fetch inline review comments |
| `get_pr_details` | PR metadata, labels, reviewers |
| `web_search` | Search the web (delegated to agent) |
| `web_fetch` | Fetch URL content (delegated to agent) |
| `run_react_doctor` | Run react-doctor analysis |

Type `/undo` to remove the last exchange.

## Analysis Pipeline

1. **Fetch** — PR metadata, commits, diff, and discussion from GitHub API
2. **Parse** — unified diff into per-file chunks
3. **Clone** — bare repo with worktree checkout (cached in `~/.newpr/repos/`)
4. **Explore** — 3-4 phase codebase exploration via agent:
   - Structure — project type, architecture
   - Related code — imports, usages, tests
   - Issues — breaking changes, inconsistencies
   - React Doctor — code quality score (React projects only)
5. **Analyze** — LLM summarizes each file in parallel batches
6. **Group** — LLM clusters files with key changes, risk, dependencies
7. **Summarize** — purpose, scope, impact, risk level
8. **Narrate** — prose walkthrough with line-level code references

## LLM Backends

| Backend | Setup | Use case |
|---------|-------|----------|
| **OpenRouter** | `OPENROUTER_API_KEY` | Full model selection |
| **Claude Code** | `claude` CLI installed | Zero-config fallback |
| **Codex CLI** | `codex` CLI installed | Alternate zero-config fallback |

## Exploration Agents

| Agent | Install | Detection |
|-------|---------|-----------|
| Claude Code | `npm i -g @anthropic-ai/claude-code` | `which claude` |
| OpenCode | `npm i -g opencode` | `which opencode` |
| Codex | `npm i -g @openai/codex` | `which codex` |

Agents run with read-only tools (Read, Glob, Grep, Bash, WebSearch, WebFetch). No write operations.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No* | OpenRouter API key (*falls back to Claude Code) |
| `GITHUB_TOKEN` | No | GitHub token (falls back to `gh` CLI) |
| `NEWPR_MODEL` | No | Default model (default: `anthropic/claude-sonnet-4.6`) |
| `NEWPR_MAX_FILES` | No | Max files to analyze (default: 100) |
| `NEWPR_TIMEOUT` | No | Timeout per LLM call in seconds (default: 120) |
| `NEWPR_CONCURRENCY` | No | Parallel LLM calls (default: 5) |

## Config

Persistent settings in `~/.newpr/config.json`:

```json
{
  "openrouter_api_key": "sk-or-...",
  "model": "anthropic/claude-sonnet-4.6",
  "language": "auto",
  "agent": "claude",
  "max_files": 100,
  "timeout": 120,
  "concurrency": 5
}
```

## Development

```bash
git clone https://github.com/jiwonMe/newpr
cd newpr
bun install
bun test              # 91 tests
bun run typecheck     # tsc --noEmit
bun run start         # launch CLI
```

## Architecture

```
src/
├── cli/          # CLI entry, args, auth, preflight, update-check
├── config/       # Config loading (~/.newpr/config.json)
├── github/       # GitHub API (PR data, diff, comments)
├── diff/         # Unified diff parser + chunker
├── llm/          # LLM clients (OpenRouter + Claude Code), prompts, parser
├── analyzer/     # Pipeline orchestrator + progress events
├── workspace/    # Agent system, git operations, codebase exploration
├── types/        # Shared TypeScript types
├── history/      # Session persistence + sidecar files
├── tui/          # Ink TUI (shell, panels, theme)
└── web/          # Web UI
    ├── server.ts           # Bun.serve()
    ├── server/             # REST/SSE API, session manager
    ├── client/             # React frontend
    │   ├── components/     # AppShell, ChatSection, Markdown, TipTapEditor, etc.
    │   ├── panels/         # Story, Discussion, Groups, Files, Cartoon
    │   └── hooks/          # useAnalysis, useBackgroundAnalyses, useChatState, etc.
    └── styles/             # Tailwind v4 + Pretendard + Tab0 Mono K
```

## License

MIT
