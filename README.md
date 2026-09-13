# Expert Gate

Expert Gate adds one guarded MCP tool to Claude Code: `request_expert`.
DeepSeek performs normal coding work. A deterministic local gate allows Codex
only for difficult decisions, and Codex returns read-only advisory structured
data rather than modifying the repository.

## Architecture

```text
User -> Claude Code / DeepSeek -> request_expert
                                  |
                         validate + score
                           /            \
                        DENY          cache/budget
                                         |
                              Codex in empty temp cwd
                              read-only, no web/network
                                         |
                              structured recommendation
                                         |
                              DeepSeek verifies, edits, tests
```

DeepSeek is the single writer. Codex receives only the bounded Decision Packet,
not repository access or a repository path.

## Requirements

- Node.js 18 or newer
- Claude Code
- Codex CLI authenticated with `codex login`
- A Codex model available to the authenticated account
- A DeepSeek-compatible Claude Code provider when running the launcher

Validated during development with Node 24.13.0, Claude Code 2.1.269, Codex
CLI/SDK 0.154.0, MCP SDK 1.30.0, and Zod 4.6.2.

## Installation

```bash
cd /home/gugu/바탕화면/MainProject/expert-gate
npm ci
npm run typecheck
npm run build
```

Register the compiled server once at Claude Code user scope:

```bash
claude mcp add --scope user --transport stdio expert_gate \
  -e EXPERT_MODEL=gpt-6-astra -- \
  /home/gugu/바탕화면/MainProject/expert-gate/bin/expert-gate-stdio
```

The tiny stdio launcher passes protocol bytes through `tee /dev/null`. This
works around a Node 24 direct-child stdio close observed with Claude Code and
the MCP SDK; it does not retain protocol traffic.

Install the launcher and user-level behavioral rule:

```bash
install -D -m 0755 bin/claude-deepseek ~/.local/bin/claude-deepseek
install -D -m 0644 config/expert-gate-rule.md ~/.claude/rules/expert-gate.md
```

The launcher auto-allows only `mcp__expert_gate__request_expert` through a
session settings overlay. It does not wildcard-allow other MCP tools.

## DeepSeek launcher setup

With an existing Claude Code provider configuration, the launcher preserves it.
This is the current path for the configured BytePlus DeepSeek endpoint:

```bash
cd /path/to/project
claude-deepseek
```

That endpoint currently needs its subscription activated before a live model
request succeeds.

To use DeepSeek's official Anthropic-compatible endpoint, provide the key from
your shell or secret manager; the launcher does not save it:

```bash
export DEEPSEEK_API_KEY='...'
claude-deepseek
```

The current official defaults are `https://api.deepseek.com/anthropic` and
`deepseek-flash[1m]`. Override them with `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`,
or `DEEPSEEK_SUBAGENT_MODEL`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPERT_MODEL` | required | Codex consultant model |
| `EXPERT_REASONING` | `high` | Codex reasoning effort |
| `EXPERT_GATE_THRESHOLD` | `5` | Minimum deterministic score |
| `EXPERT_MAX_TASK_CALLS` | `2` | Actual Codex calls per `taskId` |
| `EXPERT_MAX_SESSION_CALLS` | `4` | Actual Codex calls per MCP process |
| `EXPERT_LOG_PATH` | `~/.local/state/expert-gate/events.ndjson` | Metadata log |
| `DEEPSEEK_API_KEY` | unset | Enables official DeepSeek endpoint in launcher |

Change MCP-side variables by removing and re-adding the user server with the
desired `-e NAME=value` flags.

## How `request_expert` works

The request includes a stable task ID, task and question, escalation reason,
category, risk, confidence, failed attempts, up to eight concise evidence
items, and up to five competing hypotheses. File paths must be repository
relative; absolute paths and parent traversal are rejected.

Large strings and arrays are rejected before gating. Empty evidence is accepted
only so the gate can return a useful denial telling the primary agent to keep
investigating.

Approved responses contain a verdict, diagnosis, recommendation, rationale,
verification steps, actions to avoid, missing evidence, confidence, and token
usage. The response explicitly remains advisory.

## Gate policy

Scores are cumulative:

- failed attempts >= 1: +1; >= 2: +2; >= 3: +2
- confidence < 0.70: +1; < 0.55: +1; < 0.35: +1
- high risk: +2; critical risk: +4
- security, auth, database, or infra: +1
- at least two hypotheses: +1
- at least two evidence items: +1

No evidence always denies. Otherwise the default threshold is 5.

## Cache and budget policy

The in-memory duplicate key covers `taskId`, question, evidence, and
hypotheses. A cache hit returns the saved recommendation with zero new token
usage and consumes no budget. Cache state lasts for one MCP server process.

Only real Codex attempts consume budget. Defaults are two calls per task and
four calls per MCP process. Failed calls count because they used the scarce
resource.

## Testing

```bash
npm test
npm run typecheck
npm run build
```

Tests cover validation limits, scoring, no-evidence denial, duplicate cache,
both budgets, exact Codex safety options, response validation, metadata-only
logging, launcher behavior, and a real MCP stdio list/call round trip.

## Logging

Each request appends one NDJSON event with decision metadata and token counts.
Questions, findings, hypotheses, source, prompts, responses, and credentials are
never logged. stdout is reserved for MCP protocol traffic; diagnostics use
stderr.

## Security model

- Codex runs in a fresh empty temporary directory with `sandboxMode: read-only`,
  `approvalPolicy: never`, network disabled, and web search disabled.
- The Decision Packet rejects absolute and parent-traversal paths.
- The consultant prompt treats all packet content as untrusted data and forbids
  implementation or repository exploration.
- Codex cannot write the target repository; DeepSeek verifies and implements.
- No API key is stored in this repository, Claude MCP configuration, or logs.

Codex's read-only sandbox prevents writes but is not a container-level read
allowlist. Empty working directories, hidden target paths, bounded relative
evidence, and the consultant policy provide V1 read isolation. Use an external
container or OS sandbox if future requirements demand a hard filesystem-read
boundary.

## Troubleshooting

- `EXPERT_MODEL` error: re-add the MCP server with `-e EXPERT_MODEL=<model>`.
- `Expert budget exhausted.`: continue locally or start a new Claude session;
  do not retry the same packet.
- Tool missing: run `claude mcp get expert_gate` and `claude mcp list`.
- Permission prompt: launch with `claude-deepseek` and confirm the exact tool is
  `mcp__expert_gate__request_expert`.
- DeepSeek subscription/quota error: activate the configured BytePlus
  subscription or set a valid official `DEEPSEEK_API_KEY`.
- Codex authentication error: run `codex login status` and authenticate before
  restarting Claude Code.
