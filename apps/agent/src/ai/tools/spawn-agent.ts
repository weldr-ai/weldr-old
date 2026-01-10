import { z } from "zod";

import { createTool } from "./utils";

export const SUB_AGENT_ACTIVE_TOOLS = [
  "bash",
  "search_codebase",
  "query_related_declarations",
  "complete",
] as const;

export type SubAgentToolType = (typeof SUB_AGENT_ACTIVE_TOOLS)[number];

const agentTaskSchema = z.object({
  task: z.string().describe("Clear description of what this sub-agent should accomplish"),
  context: z.string().optional().describe("Additional context or constraints for this sub-agent"),
});

export const spawnAgentsInputSchema = z.object({
  agents: z
    .array(agentTaskSchema)
    .min(1)
    .max(5)
    .describe("One or more agents to spawn (max 5). All agents run concurrently."),
});

const agentResultSchema = z.object({
  task: z.string().describe("The task that was assigned to this agent"),
  success: z.boolean().describe("Whether the agent completed successfully"),
  result: z.string().describe("Result or error message from the agent"),
});

export const spawnAgentsOutputSchema = z.object({
  results: z.array(agentResultSchema).describe("Results from all spawned agents"),
});

export type SpawnAgentsInput = z.infer<typeof spawnAgentsInputSchema>;
export type SpawnAgentsOutput = z.infer<typeof spawnAgentsOutputSchema>;
export type AgentTask = z.infer<typeof agentTaskSchema>;

export const spawnAgentsTool = createTool({
  name: "spawn_agents",
  description: `Spawn one or more sub-agents to delegate tasks. Maximum 5 agents can be spawned at once. Sub-agents cannot spawn further agents. All agents run in parallel and results are returned when all complete. The parent agent is paused until all sub-agents finish.

When you need to delegate tasks like exploring the codebase, researching, or implementing components. Use a single agent for one task or multiple agents for parallel work.`,
  inputSchema: spawnAgentsInputSchema,
  outputSchema: spawnAgentsOutputSchema,
});
