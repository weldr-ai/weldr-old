import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";

export const cleanupSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { project, branch } = input.context;

    const logger = Logger.get({
      projectId: project.id,
      branchId: branch.id,
      actor: "session-machine",
    });

    logger.info("Cleaning up session resources");

    // No cleanup needed - agentfs CLI manages its own sessions
    // The session database persists in ~/.agentfs/{branchId}.db

    await stream(branch.headVersion.chatId, {
      type: "end",
    });

    logger.info("Session cleanup completed");
  },
);
