import type { ToolSet } from "ai";
import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { agentPrompt } from "@/ai/prompts";
import {
  addIntegrationsTool,
  queryRelatedDeclarationsTool,
  searchCodebaseTool,
  spawnAgentsTool,
} from "@/ai/tools";
import { stream } from "@/core/stream";
import { getOrCreateWorkspace } from "@/core/workspace/just-bash";
import { ensureSnapshotWorkspace } from "@/session/branch-state";
import type { SessionMachineContext } from "@/session/types";

const buildToolSet = async (context: SessionMachineContext): Promise<ToolSet> => {
  const snapshotId = context.branch.snapshot?.id;

  if (!snapshotId) {
    throw new Error("Branch has no snapshot");
  }

  const { tools: bashTools } = await getOrCreateWorkspace({
    snapshotId,
    projectId: context.project.id,
  });

  // Type assertion needed: bash-tool exports Tool<{command: string}, CommandResult>
  // which is structurally compatible with ToolSet but not assignable due to variance
  return {
    ...bashTools.tools,
    searchCodebase: searchCodebaseTool(context),
    queryRelatedDeclarations: queryRelatedDeclarationsTool(context),
    spawnAgents: spawnAgentsTool(context),
    addIntegrations: addIntegrationsTool(context),
  } as unknown as ToolSet;
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
    snapshotId,
    actor: "session-machine",
  });

  logger.info("Initializing session - ensuring agentfs workspace exists");

  const result = await ensureSnapshotWorkspace(snapshotId, project.id);

  logger.info("AgentFS workspace ready", { extra: { status: result.status } });

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
