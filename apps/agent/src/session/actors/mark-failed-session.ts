import { fromPromise } from "xstate";

import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { persistSessionMetrics } from "@/core/metrics";
import { stream } from "@/core/stream";
import type { SessionMachineContext } from "@/session/types";

export const markFailedSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { branch } = input.context;
    const logger = Logger.get({
      versionId: branch.headVersion.id,
      actor: "mark-failed-session",
    });

    // Persist session metrics even on failure (cost tracking)
    try {
      const metrics = input.context.metrics.getMetrics();
      await persistSessionMetrics({
        versionId: branch.headVersion.id,
        metrics,
      });

      logger.info("Session metrics persisted on failure", {
        extra: {
          totalCost: metrics.agent.llm.totalCost,
          inputTokens: metrics.agent.llm.inputTokens,
          outputTokens: metrics.agent.llm.outputTokens,
          iterations: metrics.agent.iterations,
        },
      });
    } catch (error) {
      logger.warn("Failed to persist metrics on session failure", {
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
    }

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
