import { evaluateGate } from "./gate.js";
import { ExpertRequestSchema } from "./schema.js";
import type {
  ApprovedResult,
  ExpertGateResult,
  ExpertRequest,
  ExpertResponse,
  LogEvent,
  RuntimeConfig,
  Usage,
} from "./schema.js";
import { consultationHash, GateState } from "./state.js";

const ADVISORY =
  "This advice is advisory. Verify it against the repository before implementation.";
const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

type Consultation = { expert: ExpertResponse; usage: Usage };

export type HandlerContext = {
  config: RuntimeConfig;
  state: GateState<ApprovedResult>;
  consult: (request: ExpertRequest) => Promise<Consultation>;
  log: (event: LogEvent) => Promise<void>;
};

function event(
  request: ExpertRequest,
  decision: LogEvent["decision"],
  score: number,
  cacheHit: boolean,
  usage: Usage = ZERO_USAGE,
): LogEvent {
  return {
    timestamp: new Date().toISOString(),
    taskId: request.taskId,
    decision,
    score,
    category: request.category,
    risk: request.risk,
    confidence: request.confidence,
    failedAttempts: request.failedAttempts,
    cacheHit,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
  };
}

export async function handleExpertRequest(
  input: unknown,
  context: HandlerContext,
): Promise<ExpertGateResult> {
  const request = ExpertRequestSchema.parse(input);
  const gate = evaluateGate(request, context.config.threshold);
  if (!gate.allowed) {
    const denied: ExpertGateResult = {
      status: "denied",
      score: gate.score,
      reason: gate.reason,
    };
    await context.log(event(request, "denied", gate.score, false));
    return denied;
  }

  const hash = consultationHash(request);
  const cached = context.state.getCached(hash);
  if (cached) {
    const result: ApprovedResult = { ...cached, usage: ZERO_USAGE, cacheHit: true };
    await context.log(event(request, "approved", gate.score, true));
    return result;
  }

  if (
    context.state.reserve(
      request.taskId,
      context.config.maxTaskCalls,
      context.config.maxSessionCalls,
    ) !== "reserved"
  ) {
    const denied: ExpertGateResult = {
      status: "denied",
      score: gate.score,
      reason: "Expert budget exhausted.",
    };
    await context.log(event(request, "denied", gate.score, false));
    return denied;
  }

  try {
    const consultation = await context.consult(request);
    const result: ApprovedResult = {
      status: "approved",
      score: gate.score,
      instruction: ADVISORY,
      expert: consultation.expert,
      usage: consultation.usage,
      cacheHit: false,
    };
    context.state.setCached(hash, result);
    await context.log(event(request, "approved", gate.score, false, consultation.usage));
    return result;
  } catch (error) {
    await context.log(event(request, "error", gate.score, false));
    throw error;
  }
}
