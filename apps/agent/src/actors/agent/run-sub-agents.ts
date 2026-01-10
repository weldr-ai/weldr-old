import type { ToolSet } from "ai";
import { fromPromise } from "xstate";

import type { AiModel } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type {
  Branch,
  PendingAgentTask,
  ProjectWithConfig,
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
  agents: PendingAgentTask[];
  modelId: AiModel;
  cooldownMs: number;
  runSubAgent: RunSubAgent;
};

export const runSubAgentsActor = fromPromise<SubAgentResult[], RunSubAgentsInput>(
  async ({ input }) => {
    const logger = Logger.get({
      projectId: input.project.id,
      versionId: input.branch.headVersion.id,
    });

    logger.info(`Running ${input.agents.length} sub-agents concurrently`);

    const results = await Promise.all(
      input.agents.map((agentTask) =>
        input.runSubAgent({
          project: input.project,
          branch: input.branch,
          user: input.user,
          tools: input.tools,
          agentTask,
          modelId: input.modelId,
          cooldownMs: input.cooldownMs,
        }),
      ),
    );

    logger.info(`All ${input.agents.length} sub-agents completed`, {
      extra: {
        successCount: results.filter((result) => result.success).length,
        failureCount: results.filter((result) => !result.success).length,
      },
    });

    return results;
  },
);

export type { RunSubAgent, RunSubAgentInput, RunSubAgentsInput };
