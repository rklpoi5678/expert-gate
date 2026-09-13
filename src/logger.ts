import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { LogEvent } from "./schema.js";

export function defaultLogPath(): string {
  return join(homedir(), ".local", "state", "expert-gate", "events.ndjson");
}

export async function appendEvent(
  event: LogEvent,
  path = defaultLogPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}
