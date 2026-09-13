import assert from "node:assert/strict";
import test from "node:test";

import { handleExpertRequest } from "../src/handler.js";
import { GateState } from "../src/state.js";
import type { ApprovedResult, LogEvent, RuntimeConfig } from "../src/schema.js";
import { expertResponse, lowValueRequest, syntheticAuthRequest } from "./fixtures.js";

const config: RuntimeConfig = {
  model: "configured-model",
  reasoning: "high",
  threshold: 5,
  maxTaskCalls: 2,
  maxSessionCalls: 4,
};

function approved(score = 10): Omit<ApprovedResult, "cacheHit" | "score"> & { score?: number } {
  return {
    status: "approved",
    instruction: "This advice is advisory. Verify it against the repository before implementation.",
    expert: expertResponse,
    usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 25 },
    score,
  };
}

test("denies low-value requests without consulting", async () => {
  let calls = 0;
  const result = await handleExpertRequest(lowValueRequest, {
    config,
    state: new GateState<ApprovedResult>(),
    consult: async () => {
      calls += 1;
      return approved();
    },
    log: async () => undefined,
  });

  assert.equal(result.status, "denied");
  assert.equal(calls, 0);
});

test("returns a cached approved result without another consultation", async () => {
  let calls = 0;
  const events: LogEvent[] = [];
  const context = {
    config,
    state: new GateState<ApprovedResult>(),
    consult: async () => {
      calls += 1;
      return approved();
    },
    log: async (event: LogEvent) => {
      events.push(event);
    },
  };

  const first = await handleExpertRequest(syntheticAuthRequest, context);
  const second = await handleExpertRequest(syntheticAuthRequest, context);

  assert.equal(first.status, "approved");
  assert.equal(second.status, "approved");
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 1);
  assert.equal(events.length, 2);
});

test("denies a third distinct consultation for the same task", async () => {
  const state = new GateState<ApprovedResult>();
  const context = {
    config: { ...config, maxSessionCalls: 10 },
    state,
    consult: async () => approved(),
    log: async () => undefined,
  };

  await handleExpertRequest({ ...syntheticAuthRequest, question: "Question one" }, context);
  await handleExpertRequest({ ...syntheticAuthRequest, question: "Question two" }, context);
  const denied = await handleExpertRequest(
    { ...syntheticAuthRequest, question: "Question three" },
    context,
  );

  assert.deepEqual(denied, {
    status: "denied",
    score: 10,
    reason: "Expert budget exhausted.",
  });
});

test("denies consultations after the session budget is exhausted", async () => {
  const state = new GateState<ApprovedResult>();
  const context = {
    config: { ...config, maxTaskCalls: 10, maxSessionCalls: 2 },
    state,
    consult: async () => approved(),
    log: async () => undefined,
  };

  await handleExpertRequest({ ...syntheticAuthRequest, taskId: "task-one" }, context);
  await handleExpertRequest({ ...syntheticAuthRequest, taskId: "task-two" }, context);
  const denied = await handleExpertRequest({ ...syntheticAuthRequest, taskId: "task-three" }, context);

  assert.equal(denied.status, "denied");
  assert.equal(denied.reason, "Expert budget exhausted.");
});
