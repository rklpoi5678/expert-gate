import { createHash } from "node:crypto";

import type { ExpertRequest } from "./schema.js";

export type BudgetReservation = "reserved" | "task_exhausted" | "session_exhausted";

export class GateState<T> {
  readonly #cache = new Map<string, T>();
  readonly #taskCalls = new Map<string, number>();
  #sessionCalls = 0;

  getCached(hash: string): T | undefined {
    return this.#cache.get(hash);
  }

  setCached(hash: string, value: T): void {
    this.#cache.set(hash, value);
  }

  reserve(taskId: string, maxTaskCalls: number, maxSessionCalls: number): BudgetReservation {
    const taskCalls = this.#taskCalls.get(taskId) ?? 0;
    if (taskCalls >= maxTaskCalls) return "task_exhausted";
    if (this.#sessionCalls >= maxSessionCalls) return "session_exhausted";

    this.#taskCalls.set(taskId, taskCalls + 1);
    this.#sessionCalls += 1;
    return "reserved";
  }
}

export function consultationHash(request: ExpertRequest): string {
  const packet = {
    taskId: request.taskId.trim(),
    question: request.question.trim(),
    evidence: request.evidence,
    hypotheses: request.hypotheses,
  };
  return createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}
