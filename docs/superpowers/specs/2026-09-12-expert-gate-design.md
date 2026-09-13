# Expert Gate Harness Design

## Goal

Build a locally runnable TypeScript MCP server that lets Claude Code using
DeepSeek escalate only difficult engineering decisions to a read-only Codex
consultant. DeepSeek remains the sole writer and independently verifies every
recommendation before implementation.

## Runtime flow

```text
Claude Code / DeepSeek
  -> request_expert Decision Packet
  -> Zod input validation and size limits
  -> deterministic value gate
  -> duplicate cache lookup
  -> per-task and per-session budget reservation
  -> Codex SDK in an empty read-only temporary directory
  -> Zod-validated structured recommendation
  -> metadata-only NDJSON event log
  -> DeepSeek verifies, implements, and tests
```

The MCP server exposes exactly one tool: `request_expert`.

## Project and dependencies

The self-contained project lives at
`/home/gugu/바탕화면/MainProject/expert-gate`. It uses Node.js, TypeScript,
Zod, `@modelcontextprotocol/sdk`, and `@openai/codex-sdk`. Tests use Node's
built-in test runner; no test framework, database, daemon, or web application
is added.

Verified local/package versions at design time:

- Node.js 24.13.0 and npm 11.6.2
- Codex CLI and `@openai/codex-sdk` 0.154.0
- Claude Code 2.1.269
- `@modelcontextprotocol/sdk` 1.30.0
- Zod 4.6.2

## Components

- `src/schema.ts`: request, response, configuration, and MCP result schemas.
- `src/gate.ts`: pure deterministic score calculation and evidence-empty deny.
- `src/state.ts`: in-memory response cache and task/session call counters.
- `src/prompt.ts`: consultant policy and Decision Packet serialization.
- `src/expert.ts`: one Codex SDK turn plus structured-response validation.
- `src/logger.ts`: append one metadata-only NDJSON record per request.
- `src/handler.ts`: validation, gate, cache, budget, consultation, and logging
  orchestration.
- `src/server.ts`: stdio MCP transport and `request_expert` registration only.
- `bin/claude-deepseek`: launcher installed into `~/.local/bin`.

These files are split only at testable responsibility boundaries. There is no
provider interface, plugin layer, router framework, or persistence abstraction.

## Request validation

The request contains `taskId`, `task`, `question`, `reason`, category, risk,
confidence, failed-attempt count, evidence, and competing hypotheses.

Limits:

- task ID: 200 characters
- task, question, and reason: 2,000 characters each
- evidence: 0 to 8 items; file 500, lines 100, finding 1,500 characters
- hypotheses: up to 5 items; hypothesis 1,000 characters; each evidence list up
  to 8 entries of 1,000 characters
- confidence: 0 through 1
- failed attempts: non-negative integer capped at 100

Unknown fields are rejected. Evidence content is treated as untrusted data by
the consultant prompt.

## Deterministic gate

An empty evidence array is denied immediately. Otherwise the score is the sum
of these cumulative rules:

- failed attempts >= 1: +1; >= 2: +2; >= 3: +2
- confidence < 0.70: +1; < 0.55: +1; < 0.35: +1
- high risk: +2; critical risk: +4
- security, auth, database, or infra category: +1
- at least two hypotheses: +1
- at least two evidence items: +1

The default threshold is 5 and is configurable with
`EXPERT_GATE_THRESHOLD`. A score below the threshold is denied without a
Codex call.

## Cache and budgets

The duplicate hash covers normalized `taskId`, `question`, `evidence`, and
`hypotheses`. Cache lookup happens after the value gate and before budget
checks. A hit returns the prior approved result with `cacheHit: true` and does
not consume budget.

Only actual consultation attempts consume budget. The default limits are two
calls per `taskId` and four calls per MCP server process, configured by
`EXPERT_MAX_TASK_CALLS` and `EXPERT_MAX_SESSION_CALLS`. Counters are reserved
synchronously before awaiting Codex so concurrent requests cannot exceed a
budget. Failed Codex attempts still count because they consumed the scarce
resource.

## Consultant isolation

`EXPERT_MODEL` is required at runtime and is never hard-coded in source.
`EXPERT_REASONING` defaults to `high`.

Every consultation starts a fresh Codex thread with:

- an empty temporary working directory outside the target repository
- `skipGitRepoCheck: true`
- `sandboxMode: "read-only"`
- `approvalPolicy: "never"`
- `networkAccessEnabled: false`
- `webSearchMode: "disabled"`
- an output JSON Schema passed through `outputSchema`

The model receives only the consultant policy and serialized Decision Packet.
It receives no repository path and cannot inspect or modify the target. The
response is parsed as JSON and validated with Zod before returning it.

## Responses and errors

Denied requests return `status: "denied"`, the score, and a stable reason.
Approved and cached requests return `status: "approved"`, score, advisory
instruction, structured expert response, token usage, and `cacheHit`.

Validation errors are MCP tool errors. Gate and budget denials are successful
tool results so DeepSeek can continue investigating. Consultant failures return
a concise MCP error without leaking credentials or raw prompts.

## Logging

The default log path is `~/.local/state/expert-gate/events.ndjson`, overridable
with `EXPERT_LOG_PATH`. Each line records timestamp, task ID, decision, score,
category, risk, request confidence, failed attempts, cache status, and available
token usage. It never records source snippets, questions, hypotheses, prompts,
responses, or environment values.

Nothing except MCP protocol messages is written to stdout. Diagnostics use
stderr.

## Claude Code installation

The built server is registered once at user scope with the verified CLI form:

```bash
claude mcp add --scope user --transport stdio \
  -e EXPERT_MODEL=gpt-6-astra \
  expert_gate -- /home/gugu/바탕화면/MainProject/expert-gate/bin/expert-gate-stdio
```

The exact tool permission is `mcp__expert_gate__request_expert`. The launcher
passes this one name through `--allowedTools`; it does not wildcard-allow MCP
servers.

The behavioral policy is installed as
`~/.claude/rules/expert-gate.md`, the current supported user-level rule
location.

## DeepSeek launcher

`claude-deepseek` never stores a credential. When `DEEPSEEK_API_KEY` is set, it
exports the official Anthropic-compatible endpoint and current Flash model;
otherwise it preserves the user's existing Claude provider settings. The model
and endpoint remain overridable by environment variables.

The current BytePlus DeepSeek endpoint is configured but returns a subscription
or quota error because the user has not subscribed yet. Installation and all
non-DeepSeek verification continue now; the final DeepSeek live test is rerun
after the user activates that subscription.

## Verification

Automated checks cover schema limits, deny and allow scoring, evidence-empty
denial, duplicate cache reuse, task budget, session budget, structured response
validation, safe Codex options, metadata-only logging, and MCP tool discovery
and invocation.

Final verification runs:

1. tests, typecheck, and build
2. a real stdio MCP client listing `request_expert`
3. low-value DENY without consultation
4. synthetic high-value ALLOW
5. a real GPT-6 Astra structured consultation
6. repeated request cache behavior
7. task and session budget exhaustion
8. Claude user-scope MCP health and tool exposure
9. `claude-deepseek` tool recognition when the DeepSeek subscription is active

## Explicitly excluded from V1

No repository access for Codex, writes by Codex, multiple expert tools,
multi-agent framework, database, persistent cache, web UI, daemon, vector
store, model router, deployment, or automatic training is included.
