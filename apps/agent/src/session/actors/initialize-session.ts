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
  const bashTools = await getOrCreateBashTool(
    context.project.id,
    context.branch.id,
    context.versionId,
  );

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
  const { project, branch } = input.context;

  const logger = Logger.get({
    projectId: project.id,
    branchId: branch.id,
    versionId: branch.headVersion.id,
    actor: "session-machine",
  });

  logger.info("Initializing session - ensuring agentfs session exists");

  const result = await ensureBranchSession(branch.id, project.id);

  logger.info("AgentFS session ready", { extra: { status: result.status } });

  await stream(branch.headVersion.chatId, {
    type: "status",
    status: "thinking",
  });

  const [tools, systemPrompt] = await Promise.all([
    buildToolSet(input.context),
    agentPrompt(project),
  ]);

  return { ...result, tools, systemPrompt };
});
