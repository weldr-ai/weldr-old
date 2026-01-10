import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { ensureBranchDir } from "@/lib/branch-state";
import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/session-types";

type InitializeResult = {
  branchDir: string;
  status: "created" | "reused" | "forked";
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

  return result;
});
