import type { ToolSet } from "ai";
import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { agentPrompt } from "@/ai/prompts";
import {
  addIntegrationsTool,
  getOrCreateBashTool,
  queryRelatedDeclarationsTool,
  searchCodebaseTool,
  spawnAgentsTool,
} from "@/ai/tools";
import { stream } from "@/core/stream";
import { ensureBranchSession } from "@/session/branch-state";
import type { SessionMachineContext } from "@/session/types";

const buildToolSet = async (context: SessionMachineContext): Promise<ToolSet> => {
  const snapshotId = context.branch.snapshot?.id;
  if (!snapshotId) {
    throw new Error("Branch has no snapshot");
  }

  const bashTools = await getOrCreateBashTool(context.project.id, context.branch.id, snapshotId);

  return {
    ...bashTools,
    search_codebase: searchCodebaseTool(context),
    query_related_declarations: queryRelatedDeclarationsTool(context),
    spawn_agents: spawnAgentsTool(context),
    add_integrations: addIntegrationsTool(context),
  };
};

type InitializeResult = {
  status: "created" | "reused" | "forked";
  tools: ToolSet;
  systemPrompt: string;
};

export const initializeSessionActor = fromPromise<
  InitializeResult,
  { context: SessionMachineContext }
>(async ({ input }) => {
  const { project, branch, chatId } = input.context;

  const snapshotId = branch.snapshot?.id;
  if (!snapshotId) {
    throw new Error("Branch has no snapshot");
  }

  const logger = Logger.get({
    projectId: project.id,
    branchId: branch.id,
    snapshotId,
    actor: "session-machine",
  });

  logger.info("Initializing session - ensuring agentfs session exists");

  const result = await ensureBranchSession(branch.id, project.id, snapshotId);

  logger.info("AgentFS session ready", { extra: { status: result.status } });

  await stream(chatId, {
    type: "status",
    status: "thinking",
  });

  const [tools, systemPrompt] = await Promise.all([
    buildToolSet(input.context),
    agentPrompt(project),
  ]);

  return { ...result, tools, systemPrompt };
});
