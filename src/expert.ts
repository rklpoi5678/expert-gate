import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Codex } from "@openai/codex-sdk";
import type {
  ThreadOptions,
  TurnOptions,
  Usage as SdkUsage,
} from "@openai/codex-sdk";

import { buildConsultantPrompt } from "./prompt.js";
import {
  ExpertResponseJsonSchema,
  ExpertResponseSchema,
} from "./schema.js";
import type {
  ExpertRequest,
  ExpertResponse,
  RuntimeConfig,
  Usage,
} from "./schema.js";

type CodexTurn = { finalResponse: string; usage: SdkUsage | null };
type CodexLike = {
  startThread(options?: ThreadOptions): {
    run(input: string, options?: TurnOptions): Promise<CodexTurn>;
  };
};
type CodexFactory = () => CodexLike;

function usageFromSdk(usage: SdkUsage | null): Usage {
  return usage
    ? {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reasoningTokens: usage.reasoning_output_tokens,
      }
    : { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

export async function consultExpert(
  request: ExpertRequest,
  config: RuntimeConfig,
  createCodex: CodexFactory = () => new Codex(),
): Promise<{ expert: ExpertResponse; usage: Usage }> {
  const workingDirectory = await mkdtemp(join(tmpdir(), "expert-gate-consultant-"));

  try {
    const thread = createCodex().startThread({
      model: config.model,
      modelReasoningEffort: config.reasoning,
      workingDirectory,
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    const turn = await thread.run(buildConsultantPrompt(request), {
      outputSchema: ExpertResponseJsonSchema,
    });
    const expert = ExpertResponseSchema.parse(JSON.parse(turn.finalResponse));
    return { expert, usage: usageFromSdk(turn.usage) };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
