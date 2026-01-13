import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import type { ToolExecutor } from "@/ai/tools/types";

type ExecuteActorInput = {
  toolName: string;
  input: unknown;
  toolExecutor: ToolExecutor;
};

export const executeToolActor = fromPromise<unknown, ExecuteActorInput>(async ({ input }) => {
  const { toolName, input: toolInput, toolExecutor } = input;

  const logger = Logger.get({ actor: "tool-machine", toolName });
  logger.debug("Executing tool", { extra: { toolName } });

  const result = await toolExecutor(toolName, toolInput);

  logger.debug("Tool execution completed", { extra: { toolName } });

  return result;
});
