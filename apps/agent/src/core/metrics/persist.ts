import { eq } from "drizzle-orm";

import { db } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type { SessionMetrics } from "./types";

export type PersistMetricsInput = {
  versionId: string;
  metrics: SessionMetrics;
};

export async function persistSessionMetrics({
  versionId,
  metrics,
}: PersistMetricsInput): Promise<void> {
  const logger = Logger.get({ versionId, operation: "persist-metrics" });

  try {
    await db
      .update(versions)
      .set({
        inputTokens: metrics.agent.llm.inputTokens,
        outputTokens: metrics.agent.llm.outputTokens,
        totalCost: metrics.agent.llm.totalCost,
        iterations: metrics.agent.iterations,
        durationMs: metrics.totalDurationMs,
      })
      .where(eq(versions.id, versionId));

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
