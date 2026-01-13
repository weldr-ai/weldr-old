import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";

export const notifyCancelledActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { project, branch } = input.context;

    const logger = Logger.get({
      projectId: project.id,
      branchId: branch.id,
      versionId: branch.headVersion.id,
      actor: "session-machine",
    });
    logger.info("Session cancelled");

    await stream(branch.headVersion.chatId, {
      type: "status",
      status: null,
    });
  },
);
