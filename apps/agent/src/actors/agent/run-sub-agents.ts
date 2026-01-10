import type { ToolSet } from "ai";
import { fromPromise } from "xstate";

import type { AiModel } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type {
  Branch,
  PendingAgentTask,
  PendingSpawnRequest,
  ProjectWithConfig,
  SubAgentBatchResult,
  SubAgentResult,
} from "@/actors/agent/agent-actor-types";
import type { User } from "@/lib/auth";

type RunSubAgentInput = {
  project: ProjectWithConfig;
  branch: Branch;
  user: User;
  tools: ToolSet;
  agentTask: PendingAgentTask;
  modelId: AiModel;
  cooldownMs: number;
};

type RunSubAgent = (input: RunSubAgentInput) => Promise<SubAgentResult>;

type RunSubAgentsInput = {
  project: ProjectWithConfig;
  branch: Branch;
  user: User;
  tools: ToolSet;
  pendingSpawnRequests: PendingSpawnRequest[];
  modelId: AiModel;
  cooldownMs: number;
  runSubAgent: RunSubAgent;
};

export const runSubAgentsActor = fromPromise<SubAgentBatchResult[], RunSubAgentsInput>(
  async ({ input }) => {
    const logger = Logger.get({
      projectId: input.project.id,
      versionId: input.branch.headVersion.id,
    });

    const totalAgents = input.pendingSpawnRequests.reduce(
      (count, request) => count + request.agents.length,
      0,
    );

    logger.info(`Running ${totalAgents} sub-agents concurrently`, {
      extra: { requestCount: input.pendingSpawnRequests.length },
    });

    const batches = await Promise.all(
      input.pendingSpawnRequests.map(async (request) => {
        const results = await Promise.all(
          request.agents.map(async (agentTask) => {
            try {
              return await input.runSubAgent({
                project: input.project,
                branch: input.branch,
                user: input.user,
                tools: input.tools,
                agentTask,
                modelId: input.modelId,
                cooldownMs: input.cooldownMs,
              });
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Sub-agent execution failed";
              return {
                task: agentTask.task,
                success: false,
                result: errorMessage,
              } satisfies SubAgentResult;
            }
          }),
        );

        return {
          toolCallId: request.toolCallId,
          results,
        } satisfies SubAgentBatchResult;
      }),
    );

    const successCount = batches
      .flatMap((batch) => batch.results)
      .filter((result) => result.success).length;
    const failureCount = totalAgents - successCount;

    logger.info(`All ${totalAgents} sub-agents completed`, {
      extra: {
        requestCount: input.pendingSpawnRequests.length,
        successCount,
        failureCount,
      },
    });

    return batches;
  },
);

export type { RunSubAgent, RunSubAgentInput, RunSubAgentsInput };
