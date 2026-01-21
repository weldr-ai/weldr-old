import { z } from "zod";

import { runSubAgents } from "@/ai/agent/sub-agents";
import { createTool } from "../utils/create-tool";

export const spawnAgentsInputSchema = z.object({
  agents: z
    .object({
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, "Must be kebab-case starting with a letter")
        .max(32, "Max 32 characters")
        .describe("Unique kebab-case ID for this agent (e.g., 'create-schema', 'setup-api')"),
      task: z.string().describe("Clear description of what this sub-agent should accomplish"),
      context: z
        .string()
        .optional()
        .describe("Additional context or constraints for this sub-agent"),
      depends: z
        .array(z.string())
        .optional()
        .describe(
          "IDs of agents that must complete first. Agents without dependencies run in parallel.",
        ),
    })
    .array()
    .min(1)
    .max(10)
    .describe("Agents to spawn. Use 'depends' for execution order, omit for parallel execution."),
});

export const spawnAgentsOutputSchema = z.object({
  results: z
    .object({
      id: z.string().describe("The unique ID of this agent"),
      task: z.string().describe("The task that was assigned to this agent"),
      success: z.boolean().describe("Whether the agent completed successfully"),
      result: z.string().describe("Result or error message from the agent"),
    })
    .array()
    .describe("Results from all spawned agents"),
});

export const spawnAgentsTool = createTool({
  name: "spawn_agents",
  description: `Spawn sub-agents to delegate tasks. Sub-agents run in parallel by default.
Use 'depends' to specify execution order when tasks have dependencies.

PARALLEL EXECUTION (no dependencies):
  agents: [
    {
      id: "search-api",
      task: "List API endpoints related to billing",
      context: "Look under apps/agent/src and packages/api; report file paths",
    },
    {
      id: "search-db",
      task: "Identify billing-related tables and fields",
      context: "Check packages/db schema files; summarize table names",
    }
  ]
  -> Both run simultaneously

SEQUENTIAL WITH DEPENDENCIES:
  agents: [
    {
      id: "create-schema",
      task: "Design billing schema in Drizzle",
      context: "Follow existing tables in packages/db; include migrations",
    },
    {
      id: "create-api",
      task: "Add billing API routes",
      context: "Use tRPC patterns in packages/api; validate with Zod",
      depends: ["create-schema"],
    },
    {
      id: "create-tests",
      task: "Write API tests for billing routes",
      context: "Use existing test harness in packages/api",
      depends: ["create-api"],
    }
  ]
  -> schema runs first, then api, then tests

MIXED PARALLEL AND SEQUENTIAL:
  agents: [
    {
      id: "schema",
      task: "Create billing schema",
      context: "Add Drizzle tables in packages/db",
    },
    {
      id: "api",
      task: "Create billing API",
      context: "Implement tRPC router in packages/api",
      depends: ["schema"],
    },
    {
      id: "docs",
      task: "Draft billing API docs",
      context: "Update docs in apps/web content",
    },
    {
      id: "frontend",
      task: "Create billing UI",
      context: "Add pages/components in apps/web",
      depends: ["api"],
    }
  ]
  -> schema and docs run in parallel, api waits for schema, frontend waits for api

If an agent fails, its dependent agents are cancelled.
Sub-agents cannot spawn further agents. Maximum 10 agents per call.`,
  inputSchema: spawnAgentsInputSchema,
  outputSchema: spawnAgentsOutputSchema,
  execute: async ({ input, context }) => {
    return runSubAgents(input, context);
  },
});
