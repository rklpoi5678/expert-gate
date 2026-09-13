#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { consultExpert } from "./expert.js";
import { handleExpertRequest } from "./handler.js";
import { appendEvent } from "./logger.js";
import {
  ExpertRequestSchema,
  ExpertResponseSchema,
  UsageSchema,
  loadConfig,
} from "./schema.js";
import { z } from "zod";
import type { ApprovedResult } from "./schema.js";
import { GateState } from "./state.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const state = new GateState<ApprovedResult>();
  const server = new McpServer({ name: "expert-gate", version: "1.0.0" });

  server.registerTool(
    "request_expert",
    {
      title: "Request a read-only expert consultation",
      description:
        "Escalate a genuinely difficult engineering decision after repository investigation, tests, and competing-hypothesis analysis. Send only a compact Decision Packet. Advice is advisory and must be verified before implementation.",
      inputSchema: ExpertRequestSchema.shape,
      outputSchema: {
        status: z.enum(["approved", "denied"]),
        score: z.number().int().nonnegative(),
        reason: z.string().optional(),
        instruction: z.string().optional(),
        expert: ExpertResponseSchema.optional(),
        usage: UsageSchema.optional(),
        cacheHit: z.boolean().optional(),
      },
    },
    async (request) => {
      try {
        const result = await handleExpertRequest(request, {
          config,
          state,
          consult: (validated) => consultExpert(validated, config),
          log: (event) => appendEvent(event, config.logPath),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Expert consultation failed. Check expert-gate configuration and stderr.",
            },
          ],
        };
      }
    },
  );

  await server.connect(new StdioServerTransport());
  console.error("expert-gate MCP server running on stdio");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`expert-gate MCP server failed to start: ${message}`);
  process.exitCode = 1;
});
