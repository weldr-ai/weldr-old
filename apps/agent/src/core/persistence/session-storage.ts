import { db, eq } from "@weldr/db";
import { versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type {
  SaveSessionStateInput,
  SessionSnapshot,
  SessionStorage,
  VersionMetrics,
} from "./types";

/**
 * @deprecated Use AgentFSSessionStorage instead
 *
 * Legacy PostgreSQL-backed session storage.
 * This class is kept for backwards compatibility only.
 * New code should use AgentFSSessionStorage which stores state in SQLite.
 *
 * The version_sessions table has been removed from the schema.
 * This class will throw errors if used.
 */
export class SessionDatabaseStorage implements SessionStorage {
  private logger = Logger.get({ service: "session-storage" });

  async saveSessionState(_input: SaveSessionStateInput): Promise<void> {
    throw new Error(
      "SessionDatabaseStorage is deprecated. The version_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async loadSessionState(_versionId: string): Promise<SessionSnapshot | null> {
    throw new Error(
      "SessionDatabaseStorage is deprecated. The version_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async deleteSessionState(_versionId: string): Promise<void> {
    throw new Error(
      "SessionDatabaseStorage is deprecated. The version_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async updateVersionMetrics(versionId: string, metrics: Partial<VersionMetrics>): Promise<void> {
    try {
      await db
        .update(versions)
        .set({
          ...(metrics.inputTokens !== undefined && { inputTokens: metrics.inputTokens }),
          ...(metrics.outputTokens !== undefined && { outputTokens: metrics.outputTokens }),
          ...(metrics.totalCost !== undefined && { totalCost: metrics.totalCost }),
          ...(metrics.iterations !== undefined && { iterations: metrics.iterations }),
          ...(metrics.durationMs !== undefined && { durationMs: metrics.durationMs }),
        })
        .where(eq(versions.id, versionId));

      this.logger.debug("Version metrics updated", {
        extra: { versionId, metrics },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to update version metrics", {
        extra: { versionId, error: message },
      });
      throw error;
    }
  }
}

/**
 * Singleton instance of session storage.
 */
export const sessionStorage = new SessionDatabaseStorage();
