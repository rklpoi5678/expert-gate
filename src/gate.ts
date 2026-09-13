import type { ExpertRequest } from "./schema.js";

export type GateDecision =
  | { allowed: true; score: number }
  | { allowed: false; score: number; reason: string };

const SENSITIVE_CATEGORIES = new Set(["security", "auth", "database", "infra"]);

export function evaluateGate(request: ExpertRequest, threshold: number): GateDecision {
  if (request.evidence.length === 0) {
    return {
      allowed: false,
      score: 0,
      reason: "Insufficient evidence. Continue investigating before escalation.",
    };
  }

  let score = 0;
  if (request.failedAttempts >= 1) score += 1;
  if (request.failedAttempts >= 2) score += 2;
  if (request.failedAttempts >= 3) score += 2;
  if (request.confidence < 0.7) score += 1;
  if (request.confidence < 0.55) score += 1;
  if (request.confidence < 0.35) score += 1;
  if (request.risk === "high") score += 2;
  if (request.risk === "critical") score += 4;
  if (SENSITIVE_CATEGORIES.has(request.category)) score += 1;
  if (request.hypotheses.length >= 2) score += 1;
  if (request.evidence.length >= 2) score += 1;

  return score >= threshold
    ? { allowed: true, score }
    : {
        allowed: false,
        score,
        reason: "Escalation threshold not met. Continue investigating before escalation.",
      };
}
