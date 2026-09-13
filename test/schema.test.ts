import assert from "node:assert/strict";
import test from "node:test";

import { ExpertRequestSchema, ExpertResponseSchema, loadConfig } from "../src/schema.js";
import { expertResponse, syntheticAuthRequest } from "./fixtures.js";

test("accepts a bounded expert request and structured response", () => {
  assert.equal(ExpertRequestSchema.parse(syntheticAuthRequest).taskId, "session-race");
  assert.equal(ExpertResponseSchema.parse(expertResponse).confidence, 0.84);
});
test("accepts empty evidence so the deterministic gate can deny it", () => {
  assert.deepEqual(
    ExpertRequestSchema.parse({ ...syntheticAuthRequest, evidence: [] }).evidence,
    [],
  );
});

test("rejects oversized questions, evidence, and hypotheses", () => {
  assert.throws(() =>
    ExpertRequestSchema.parse({ ...syntheticAuthRequest, question: "x".repeat(2001) }),
  );
  assert.throws(() =>
    ExpertRequestSchema.parse({
      ...syntheticAuthRequest,
      evidence: Array.from({ length: 9 }, () => syntheticAuthRequest.evidence[0]),
    }),
  );
  assert.throws(() =>
    ExpertRequestSchema.parse({
      ...syntheticAuthRequest,
      hypotheses: Array.from({ length: 6 }, () => syntheticAuthRequest.hypotheses[0]),
    }),
  );
});

test("rejects unknown fields", () => {
  assert.throws(() => ExpertRequestSchema.parse({ ...syntheticAuthRequest, rawLog: "secret" }));
});

test("rejects absolute evidence paths that could reveal the target repository", () => {
  assert.throws(() =>
    ExpertRequestSchema.parse({
      ...syntheticAuthRequest,
      evidence: [{ ...syntheticAuthRequest.evidence[0], file: "/home/user/project/src/auth.ts" }],
    }),
  );
  assert.throws(() =>
    ExpertRequestSchema.parse({
      ...syntheticAuthRequest,
      evidence: [{ ...syntheticAuthRequest.evidence[0], file: "C:\\project\\src\\auth.ts" }],
    }),
  );
  assert.throws(() =>
    ExpertRequestSchema.parse({
      ...syntheticAuthRequest,
      evidence: [{ ...syntheticAuthRequest.evidence[0], file: "../../project/src/auth.ts" }],
    }),
  );
});

test("loads runtime defaults and integer overrides from environment values", () => {
  assert.deepEqual(loadConfig({ EXPERT_MODEL: "gpt-test" }), {
    model: "gpt-test",
    reasoning: "high",
    threshold: 5,
    maxTaskCalls: 2,
    maxSessionCalls: 4,
  });
  assert.equal(
    loadConfig({ EXPERT_MODEL: "gpt-test", EXPERT_GATE_THRESHOLD: "7" }).threshold,
    7,
  );
  assert.throws(() => loadConfig({}));
});
