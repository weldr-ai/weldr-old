import { fromPromise } from "xstate";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { stream } from "@/lib/stream-utils";
import type { SessionMachineContext } from "@/machines/types";

export const markFailedSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { branch } = input.context;

    const logger = Logger.get({
      versionId: branch.headVersion.id,
      actor: "session-machine",
    });

    logger.info("Marking version as failed");

    await db
      .update(versions)
      .set({ status: "failed" })
      .where(eq(versions.id, branch.headVersion.id));

    await stream(branch.headVersion.chatId, {
      type: "update_branch",
      data: {
        ...branch,
        headVersion: {
          ...branch.headVersion,
          status: "failed" as const,
        },
      },
    });
  },
);
