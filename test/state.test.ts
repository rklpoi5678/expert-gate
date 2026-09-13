import assert from "node:assert/strict";
import test from "node:test";

import { GateState, consultationHash } from "../src/state.js";
import { syntheticAuthRequest } from "./fixtures.js";

test("reserves task and session budgets atomically", () => {
  const state = new GateState<string>();

  assert.equal(state.reserve("task-a", 2, 4), "reserved");
  assert.equal(state.reserve("task-a", 2, 4), "reserved");
  assert.equal(state.reserve("task-a", 2, 4), "task_exhausted");
  assert.equal(state.reserve("task-b", 2, 2), "session_exhausted");
});

test("hashes only duplicate-defining request fields", () => {
  const changedMetadata = {
    ...syntheticAuthRequest,
    task: "Different task prose",
    reason: "Different escalation prose",
    risk: "critical" as const,
    confidence: 0.1,
    failedAttempts: 8,
  };

  assert.equal(consultationHash(syntheticAuthRequest), consultationHash(changedMetadata));
  assert.notEqual(
    consultationHash(syntheticAuthRequest),
    consultationHash({ ...syntheticAuthRequest, question: "A different question" }),
  );
});

test("returns cached values without exposing internal storage", () => {
  const state = new GateState<string>();
  state.setCached("hash", "answer");
  assert.equal(state.getCached("hash"), "answer");
});
