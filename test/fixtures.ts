import type { ExpertRequest, ExpertResponse } from "../src/schema.js";

export const lowValueRequest: ExpertRequest = {
  taskId: "simple-task",
  task: "Rename a local variable.",
  question: "Should this variable be renamed?",
  reason: "Requesting a second opinion.",
  category: "other",
  risk: "low",
  confidence: 0.9,
  failedAttempts: 0,
  evidence: [
    { file: "src/example.ts", lines: "1-3", finding: "The name is local." },
  ],
  hypotheses: [],
};

export const syntheticAuthRequest: ExpertRequest = {
  taskId: "session-race",
  task: "Find why staging sessions disappear after refresh.",
  question: "Which hypothesis best explains the intermittent logout?",
  reason: "Two plausible causes remain after investigation.",
  category: "auth",
  risk: "high",
  confidence: 0.35,
  failedAttempts: 2,
  evidence: [
    {
      file: "src/auth/cookies.ts",
      lines: "20-44",
      finding: "Staging is cross-domain and SameSite settings match the intended flow.",
    },
    {
      file: "src/auth/refresh.ts",
      lines: "71-110",
      finding: "Two refresh requests can overlap and each rotates the same token.",
    },
  ],
  hypotheses: [
    {
      hypothesis: "The browser rejects the session cookie.",
      evidenceFor: ["Only staging crosses domains."],
      evidenceAgainst: ["Cookie attributes are present on observed responses."],
    },
    {
      hypothesis: "Concurrent refresh rotation invalidates the winning response.",
      evidenceFor: ["Refresh requests overlap before logout."],
      evidenceAgainst: ["No server trace yet proves ordering."],
    },
  ],
};

export const expertResponse: ExpertResponse = {
  verdict: "recommendation",
  diagnosis: "A refresh-token rotation race is the leading hypothesis.",
  recommendation: "Serialize refreshes per session and verify token ordering.",
  rationale: ["Overlapping rotation can invalidate an otherwise valid response."],
  verify: ["Reproduce with two concurrent refresh requests."],
  avoid: ["Do not weaken cookie security settings without evidence."],
  missingEvidence: ["Server-side timestamps for both refresh attempts."],
  confidence: 0.84,
};
