import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGate } from "../src/gate.js";
import { lowValueRequest, syntheticAuthRequest } from "./fixtures.js";

test("denies low-value requests below the threshold", () => {
  assert.deepEqual(evaluateGate(lowValueRequest, 5), {
    allowed: false,
    score: 0,
    reason: "Escalation threshold not met. Continue investigating before escalation.",
  });
});

test("allows a high-risk auth request with competing hypotheses", () => {
  assert.deepEqual(evaluateGate(syntheticAuthRequest, 5), {
    allowed: true,
    score: 10,
  });
});

test("denies requests without evidence before scoring", () => {
  assert.deepEqual(evaluateGate({ ...syntheticAuthRequest, evidence: [] }, 5), {
    allowed: false,
    score: 0,
    reason: "Insufficient evidence. Continue investigating before escalation.",
  });
});
