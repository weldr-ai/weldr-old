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
import { ensureBranchSession } from "@/lib/branch-state";
import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";
import { createSessionContext } from "@/session";

const buildToolSet = async (context: SessionMachineContext): Promise<ToolSet> => {
  const sessionContext = createSessionContext({
    project: context.project,
    branch: context.branch,
    user: context.user,
  });

  const bashTools = await getOrCreateBashTool(sessionContext.project.id, sessionContext.branch.id);

  return {
    ...bashTools,
    search_codebase: searchCodebaseTool(sessionContext),
    query_related_declarations: queryRelatedDeclarationsTool(sessionContext),
    spawn_agents: spawnAgentsTool(sessionContext),
    add_integrations: addIntegrationsTool(sessionContext),
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
