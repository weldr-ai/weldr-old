import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { agentFSManager } from "@/lib/storage";
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

    try {
      await agentFSManager.forceClose(project.id, branch.id);
    } catch (error) {
      logger.warn("Failed to close AgentFS connection during cleanup", {
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    await stream(branch.headVersion.chatId, {
      type: "end",
    });

    logger.info("Session cleanup completed");
  },
);
