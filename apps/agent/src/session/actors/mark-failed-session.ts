import { fromPromise } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { persistSessionMetrics } from "@/core/metrics";
import { stream } from "@/core/stream";
import type { SessionMachineContext } from "@/session/types";

export const markFailedSessionActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { branch, chatId } = input.context;

    const snapshotId = branch.snapshot?.id;
    if (!snapshotId) {
      // No snapshot to update, just log and return
      Logger.warn("No snapshot to mark as failed");
      return;
    }

    const logger = Logger.get({
      snapshotId,
      actor: "mark-failed-session",
    });

    // Persist session metrics even on failure (cost tracking)
    try {
      const metrics = input.context.metrics.getMetrics();
      await persistSessionMetrics({
        snapshotId,
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

    // Note: snapshots no longer have a status field
    // The session failure is tracked at the chat/workflow level now

    await stream(chatId, {
      type: "update_branch",
      data: {
        ...branch,
      },
    });
  },
);
