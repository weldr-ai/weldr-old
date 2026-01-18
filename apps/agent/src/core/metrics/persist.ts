import { db, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type { SessionMetrics } from "./types";

export type PersistMetricsInput = {
  snapshotId: string;
  metrics: SessionMetrics;
};

export async function persistSessionMetrics({
  snapshotId,
  metrics,
}: PersistMetricsInput): Promise<void> {
  const logger = Logger.get({ snapshotId, operation: "persist-metrics" });

  try {
    await db
      .update(snapshots)
      .set({
        inputTokens: metrics.agent.llm.inputTokens,
        outputTokens: metrics.agent.llm.outputTokens,
        totalCost: metrics.agent.llm.totalCost,
      })
      .where(eq(snapshots.id, snapshotId));

    logger.info("Session metrics persisted", {
      extra: {
        inputTokens: metrics.agent.llm.inputTokens,
        outputTokens: metrics.agent.llm.outputTokens,
        totalCost: metrics.agent.llm.totalCost,
        iterations: metrics.agent.iterations,
        durationMs: metrics.totalDurationMs,
      },
    });
  } catch (error) {
    logger.error("Failed to persist session metrics", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
