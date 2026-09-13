import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { lowValueRequest } from "./fixtures.js";

test("exposes only request_expert and denies a low-value request over stdio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "expert-gate-mcp-test-"));
  const transport = new StdioClientTransport({
    command: resolve("bin/expert-gate-stdio"),
    env: {
      EXPERT_MODEL: "unused-for-denied-request",
      EXPERT_GATE_THRESHOLD: "5",
      EXPERT_LOG_PATH: join(directory, "events.ndjson"),
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => undefined);
  const client = new Client({ name: "expert-gate-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["request_expert"],
    );

    const result = await client.callTool({ name: "request_expert", arguments: lowValueRequest });
    assert.notEqual(result.isError, true);
    assert.equal(
      (result.structuredContent as { status?: string } | undefined)?.status,
      "denied",
    );
  } finally {
    await client.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
