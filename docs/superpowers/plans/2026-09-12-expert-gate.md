# Expert Gate Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a globally registered one-tool Claude Code MCP server that gates scarce read-only Codex consultations while DeepSeek remains the sole implementation agent.

**Architecture:** A stdio MCP process validates a bounded Decision Packet, applies a pure score gate, then checks an in-memory duplicate cache and call budgets. Approved requests invoke one fresh Codex SDK thread in an empty read-only temporary directory and return a Zod-validated recommendation with metadata-only logging.

**Tech Stack:** Node.js 24, TypeScript, Zod 4, MCP TypeScript SDK 1.30, Codex TypeScript SDK 0.154, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-12-expert-gate-design.md`

## Global Constraints

- Expose exactly one MCP tool named `request_expert`.
- DeepSeek/Claude Code is the only target-repository writer.
- Codex receives only a Decision Packet and runs read-only with no approval, network, or web search.
- `EXPERT_MODEL` is runtime configuration, never a source-code model constant.
- Store no credentials and log no source, question, hypothesis, prompt, or response content.
- Add no database, persistent cache, UI, daemon, agent framework, or provider abstraction.
- Create no intermediate commits; prepare one commit only after final verification.

---

### Task 1: Package, schemas, and deterministic gate

**Files:** Create `package.json`, `tsconfig.json`, `.gitignore`, `test/fixtures.ts`, `test/schema.test.ts`, `test/gate.test.ts`, `src/schema.ts`, and `src/gate.ts`.

**Interfaces:** Produce `ExpertRequestSchema`, `ExpertResponseSchema`, `ConfigSchema`, request/response/result types, and `evaluateGate(request, threshold)`.

- [ ] **Step 1: Add package/build configuration and failing schema tests**

Use ESM, strict TypeScript, Node's test runner, and exact verified dependency versions. Test accepted input plus every requested collection/string boundary, including:

```ts
assert.equal(ExpertRequestSchema.parse(validRequest).taskId, "session-race");
assert.throws(() => ExpertRequestSchema.parse({ ...validRequest, question: "x".repeat(2001) }));
```

- [ ] **Step 2: Run `npm install && npm run build` and verify RED**

Expected: compilation fails because the production schema and gate modules do not exist.

- [ ] **Step 3: Implement strict bounded Zod schemas**

Use `.strict()`, the exact spec limits, and a handwritten JSON Schema for Codex output so no schema-conversion dependency is added.

- [ ] **Step 4: Add gate tests and verify RED**

```ts
assert.equal(evaluateGate(lowValueRequest, 5).allowed, false);
assert.equal(evaluateGate(syntheticAuthRequest, 5).allowed, true);
assert.equal(evaluateGate({ ...syntheticAuthRequest, evidence: [] }, 5).reason,
  "Insufficient evidence. Continue investigating before escalation.");
```

- [ ] **Step 5: Implement the cumulative score and verify GREEN**

Run `npm run build` and `node --test dist/test/schema.test.js dist/test/gate.test.js`; all Task 1 tests must pass.

### Task 2: Cache, budgets, and orchestration

**Files:** Create `test/state.test.ts`, `test/handler.test.ts`, `src/state.ts`, and `src/handler.ts`.

**Interfaces:** Produce `GateState`, `consultationHash(request)`, and `handleExpertRequest(request, context)`. Context supplies only `consult(request)` and `log(event)` external effects.

- [ ] **Step 1: Write failing observable state tests**

```ts
assert.equal(state.reserve("task-a", 2, 4), true);
assert.equal(state.reserve("task-a", 2, 4), true);
assert.equal(state.reserve("task-a", 2, 4), false);
```

Also prove a fifth session call is denied and equal normalized packets hash equally.

- [ ] **Step 2: Verify RED, then implement minimal state**

Use one response map, one task-count map, one session counter, and `node:crypto` SHA-256 over canonical packet JSON.

- [ ] **Step 3: Write failing handler tests**

Use a consultant function that increments a counter and returns a complete literal response. Assert low-value denial calls it zero times, duplicate approved requests call it once, and task/session exhaustion returns `Expert budget exhausted.`

```ts
assert.equal(second.status, "approved");
assert.equal(second.cacheHit, true);
assert.equal(consultCalls, 1);
```

- [ ] **Step 4: Implement and verify GREEN**

Order: validate -> gate -> cache -> reserve -> consult -> cache -> log. Failed Codex attempts remain budgeted. Run all Task 1-2 tests.

### Task 3: Read-only Codex consultant, prompt, and logging

**Files:** Create `test/expert.test.ts`, `test/logger.test.ts`, `src/prompt.ts`, `src/expert.ts`, and `src/logger.ts`.

**Interfaces:** Produce `buildConsultantPrompt(request)`, `consultExpert(request, config, createCodex?)`, and `appendEvent(event, path?)`.

- [ ] **Step 1: Write failing prompt and SDK-boundary tests**

Assert evidence is serialized as untrusted data. Capture the thread options and compare them to:

```ts
{
  model: "configured-model", modelReasoningEffort: "high",
  workingDirectory: temporaryDirectory, skipGitRepoCheck: true,
  sandboxMode: "read-only", approvalPolicy: "never",
  networkAccessEnabled: false, webSearchMode: "disabled"
}
```

Assert malformed expert JSON is rejected and the temporary directory is removed after both success and failure.

- [ ] **Step 2: Implement one fresh SDK turn**

Create with `mkdtemp`, run with `ExpertResponseJsonSchema`, parse with Zod, translate SDK usage fields to camelCase, and remove only the known generated directory in `finally`.

- [ ] **Step 3: Write failing metadata-only log test**

Parse one temporary NDJSON line and assert `question`, `evidence`, `hypotheses`, `prompt`, and `expert` keys are absent.

- [ ] **Step 4: Implement append-only logging and run all tests**

Use `mkdir({ recursive: true })` and `appendFile`; default to `~/.local/state/expert-gate/events.ndjson`.

### Task 4: Stdio MCP server

**Files:** Create `test/mcp.integration.test.ts` and `src/server.ts`.

**Interfaces:** Produce executable `dist/src/server.js` exposing only `request_expert`.

- [ ] **Step 1: Write a failing real stdio client test**

Spawn the compiled server with MCP SDK `StdioClientTransport`, list tools, then call the low-value packet with a `/tmp` log path:

```ts
assert.deepEqual(tools.tools.map((tool) => tool.name), ["request_expert"]);
assert.equal(result.structuredContent?.status, "denied");
```

- [ ] **Step 2: Implement one `registerTool` call and verify GREEN**

Return both JSON text content and `structuredContent`. Write startup and fatal diagnostics only to stderr. Confirm the client test sees no non-protocol stdout.

### Task 5: Launcher, rule, README, installation, and live verification

**Files:** Create `bin/claude-deepseek`, `config/expert-gate-rule.md`, and `README.md`; later install the launcher/rule and add one user-scope MCP entry.

**Interfaces:** Launcher consumes optional `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL`, then execs Claude with exactly `mcp__expert_gate__request_expert` added to allowed tools.

- [ ] **Step 1: Add the POSIX launcher and user-level rule source**

Preserve current provider settings when no new key is supplied. End with:

```sh
exec claude --allowedTools mcp__expert_gate__request_expert "$@"
```

- [ ] **Step 2: Write README**

Cover what it does, architecture, requirements, installation, variables, MCP and launcher setup, request/gate/budget behavior, testing, troubleshooting, security, and the unsubscribed BytePlus state.

- [ ] **Step 3: Run fresh automated verification**

```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 4: Run live Codex/cache/budget scenarios**

With `EXPERT_MODEL=gpt-6-astra`, submit the synthetic high-value auth packet twice in one MCP process. Verify the first response is schema-valid, the second is cached without another call, and new distinct requests hit both budget limits.

- [ ] **Step 5: Install user integration after filesystem approval**

Install launcher and rule, then run the verified `claude mcp add --scope user --transport stdio ...` command without storing an API key.

- [ ] **Step 6: Verify Claude integration**

Run `claude mcp get expert_gate` and `claude mcp list`, then verify exact tool exposure in Claude print mode. Record the DeepSeek live call as externally blocked until subscription activation.

- [ ] **Step 7: Inspect final diff and credentials**

```bash
git status --short -- expert-gate
git diff -- expert-gate
rg -n 'API_KEY=|AUTH_TOKEN=|BEGIN.*PRIVATE|console\.log' expert-gate --glob '!package-lock.json'
```

Confirm no secret value, target-repository path in consultant input, stdout logging, tracked `dist`, or tracked `node_modules`. Prepare but do not create `feat: add gated GPT expert escalation for Claude Code`.
