import type { ToolSet } from "ai";
import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { agentPrompt } from "@/ai/prompts";
import {
  addIntegrationsTool,
  bashTool,
  queryRelatedDeclarationsTool,
  searchCodebaseTool,
  spawnAgentsTool,
} from "@/ai/tools";
import { ensureBranchDir } from "@/lib/branch-state";
import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";
import { createSessionContext } from "@/session";

const buildToolSet = (context: SessionMachineContext): ToolSet => {
  const sessionContext = createSessionContext({
    project: context.project,
    branch: context.branch,
    user: context.user,
  });

  return {
    bash: bashTool(sessionContext),
    search_codebase: searchCodebaseTool(sessionContext),
    query_related_declarations: queryRelatedDeclarationsTool(sessionContext),
    spawn_agents: spawnAgentsTool(sessionContext),
    add_integrations: addIntegrationsTool(sessionContext),
  };
};

type InitializeResult = {
  branchDir: string;
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

  logger.info("Initializing session - ensuring branch directory exists");

  const result = await ensureBranchDir(branch.id, project.id);

  logger.info("Branch directory ready", {
    extra: { branchDir: result.branchDir, status: result.status },
  });

  await stream(branch.headVersion.chatId, {
    type: "status",
    status: "thinking",
  });

  const tools = buildToolSet(input.context);
  const systemPrompt = await agentPrompt(project);

  return { ...result, tools, systemPrompt };
});
