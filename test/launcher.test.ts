import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function fakeClaudeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "expert-gate-launcher-test-"));
  const fakeClaude = join(directory, "claude");
  await writeFile(
    fakeClaude,
    '#!/bin/sh\nprintf "%s\\n" "$ANTHROPIC_BASE_URL" "$ANTHROPIC_AUTH_TOKEN" "$ANTHROPIC_MODEL" "$ANTHROPIC_DEFAULT_SONNET_MODEL" "$@"\n',
  );
  await chmod(fakeClaude, 0o755);
  return directory;
}

test("configures the official Anthropic endpoint only when a DeepSeek key is supplied", async () => {
  const directory = await fakeClaudeDirectory();
  try {
    const result = spawnSync(join(process.cwd(), "bin", "claude-deepseek"), ["--version"], {
      encoding: "utf8",
      env: {
        PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
        DEEPSEEK_API_KEY: "test-key",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "https://api.deepseek.com/anthropic",
      "test-key",
      "deepseek-flash[1m]",
      "deepseek-flash[1m]",
      "--settings",
      '{"permissions":{"allow":["mcp__expert_gate__request_expert"]}}',
      "--version",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves an existing provider configuration when no new key is supplied", async () => {
  const directory = await fakeClaudeDirectory();
  try {
    const result = spawnSync(join(process.cwd(), "bin", "claude-deepseek"), [], {
      encoding: "utf8",
      env: {
        PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
        ANTHROPIC_BASE_URL: "https://existing-provider.example",
        ANTHROPIC_AUTH_TOKEN: "existing-token",
        ANTHROPIC_MODEL: "existing-model",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "https://existing-provider.example",
      "existing-token",
      "existing-model",
      "",
      "--settings",
      '{"permissions":{"allow":["mcp__expert_gate__request_expert"]}}',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
