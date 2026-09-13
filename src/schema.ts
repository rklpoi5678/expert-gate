import { z } from "zod";
import { isAbsolute } from "node:path";

export const CategorySchema = z.enum([
  "debug",
  "architecture",
  "security",
  "auth",
  "database",
  "infra",
  "performance",
  "other",
]);

export const RiskSchema = z.enum(["low", "medium", "high", "critical"]);

const RepositoryRelativePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.split(/[\\/]/).includes(".."),
    "Use a repository-relative path without parent traversal.",
  );

const EvidenceSchema = z
  .object({
    file: RepositoryRelativePathSchema,
    lines: z.string().min(1).max(100).optional(),
    finding: z.string().min(1).max(1500),
  })
  .strict();

const HypothesisSchema = z
  .object({
    hypothesis: z.string().min(1).max(1000),
    evidenceFor: z.array(z.string().min(1).max(1000)).max(8),
    evidenceAgainst: z.array(z.string().min(1).max(1000)).max(8),
  })
  .strict();

export const ExpertRequestSchema = z
  .object({
    taskId: z.string().min(1).max(200),
    task: z.string().min(1).max(2000),
    question: z.string().min(1).max(2000),
    reason: z.string().min(1).max(2000),
    category: CategorySchema,
    risk: RiskSchema,
    confidence: z.number().min(0).max(1),
    failedAttempts: z.number().int().min(0).max(100),
    evidence: z.array(EvidenceSchema).max(8),
    hypotheses: z.array(HypothesisSchema).max(5),
  })
  .strict();

const ResponseListSchema = z.array(z.string().min(1).max(1500)).max(8);

export const ExpertResponseSchema = z
  .object({
    verdict: z.enum(["recommendation", "need_more_evidence", "reject_hypotheses"]),
    diagnosis: z.string().min(1).max(3000),
    recommendation: z.string().min(1).max(3000),
    rationale: ResponseListSchema,
    verify: ResponseListSchema,
    avoid: ResponseListSchema,
    missingEvidence: ResponseListSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const ExpertResponseJsonSchema = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["recommendation", "need_more_evidence", "reject_hypotheses"],
    },
    diagnosis: { type: "string" },
    recommendation: { type: "string" },
    rationale: { type: "array", items: { type: "string" } },
    verify: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
    missingEvidence: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "verdict",
    "diagnosis",
    "recommendation",
    "rationale",
    "verify",
    "avoid",
    "missingEvidence",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export const ConfigSchema = z
  .object({
    model: z.string().min(1),
    reasoning: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
    threshold: z.number().int().min(0).default(5),
    maxTaskCalls: z.number().int().positive().default(2),
    maxSessionCalls: z.number().int().positive().default(4),
    logPath: z.string().min(1).optional(),
  })
  .strict();

export const UsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  })
  .strict();

export const DeniedResultSchema = z
  .object({
    status: z.literal("denied"),
    score: z.number().int().nonnegative(),
    reason: z.string().min(1),
  })
  .strict();

export const ApprovedResultSchema = z
  .object({
    status: z.literal("approved"),
    score: z.number().int().nonnegative(),
    instruction: z.string().min(1),
    expert: ExpertResponseSchema,
    usage: UsageSchema,
    cacheHit: z.boolean(),
  })
  .strict();

export const ExpertGateResultSchema = z.discriminatedUnion("status", [
  DeniedResultSchema,
  ApprovedResultSchema,
]);

export type ExpertRequest = z.infer<typeof ExpertRequestSchema>;
export type ExpertResponse = z.infer<typeof ExpertResponseSchema>;
export type RuntimeConfig = z.infer<typeof ConfigSchema>;
export type Usage = z.infer<typeof UsageSchema>;

export type ApprovedResult = {
  status: "approved";
  score: number;
  instruction: string;
  expert: ExpertResponse;
  usage: Usage;
  cacheHit: boolean;
};

export type DeniedResult = {
  status: "denied";
  score: number;
  reason: string;
};

export type ExpertGateResult = ApprovedResult | DeniedResult;

export type LogEvent = {
  timestamp: string;
  taskId: string;
  decision: "approved" | "denied" | "error";
  score: number;
  category: ExpertRequest["category"];
  risk: ExpertRequest["risk"];
  confidence: number;
  failedAttempts: number;
  cacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const candidate: Record<string, unknown> = {
    model: environment.EXPERT_MODEL,
    reasoning: environment.EXPERT_REASONING ?? "high",
    threshold: Number(environment.EXPERT_GATE_THRESHOLD ?? 5),
    maxTaskCalls: Number(environment.EXPERT_MAX_TASK_CALLS ?? 2),
    maxSessionCalls: Number(environment.EXPERT_MAX_SESSION_CALLS ?? 4),
  };
  if (environment.EXPERT_LOG_PATH) candidate.logPath = environment.EXPERT_LOG_PATH;
  return ConfigSchema.parse(candidate);
}
