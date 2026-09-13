import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { appendEvent } from "../src/logger.js";
import type { LogEvent } from "../src/schema.js";

test("writes one metadata-only NDJSON event", async () => {
  const directory = await mkdtemp(join(tmpdir(), "expert-gate-log-test-"));
  const path = join(directory, "events.ndjson");
  const event: LogEvent = {
    timestamp: "2026-09-12T12:00:00.000Z",
    taskId: "session-race",
    decision: "approved",
    score: 10,
    category: "auth",
    risk: "high",
    confidence: 0.35,
    failedAttempts: 2,
    cacheHit: false,
    inputTokens: 100,
    outputTokens: 50,
    reasoningTokens: 25,
  };

  try {
    await appendEvent(event, path);
    const stored = JSON.parse((await readFile(path, "utf8")).trim()) as Record<string, unknown>;
    assert.deepEqual(stored, event);
    for (const forbidden of ["question", "evidence", "hypotheses", "prompt", "expert"]) {
      assert.equal(forbidden in stored, false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
