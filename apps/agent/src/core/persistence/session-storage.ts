import { db, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type {
  SaveSessionStateInput,
  SessionSnapshot,
  SessionStorage,
  SnapshotMetrics,
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
      "SessionDatabaseStorage is deprecated. The snapshot_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async loadSessionState(_snapshotId: string): Promise<SessionSnapshot | null> {
    throw new Error(
      "SessionDatabaseStorage is deprecated. The snapshot_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async deleteSessionState(_snapshotId: string): Promise<void> {
    throw new Error(
      "SessionDatabaseStorage is deprecated. The snapshot_sessions table has been removed. " +
        "Use AgentFSSessionStorage (via sandbox.storage) instead.",
    );
  }

  async updateChatMetrics(snapshotId: string, metrics: Partial<SnapshotMetrics>): Promise<void> {
    try {
      await db
        .update(snapshots)
        .set({
          ...(metrics.inputTokens !== undefined && { inputTokens: metrics.inputTokens }),
          ...(metrics.outputTokens !== undefined && { outputTokens: metrics.outputTokens }),
          ...(metrics.totalCost !== undefined && { totalCost: metrics.totalCost }),
        })
        .where(eq(snapshots.id, snapshotId));

      this.logger.debug("Snapshot metrics updated", {
        extra: { snapshotId, metrics },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to update snapshot metrics", {
        extra: { snapshotId, error: message },
      });
      throw error;
    }
  }
}

/**
 * Singleton instance of session storage.
 */
export const sessionStorage = new SessionDatabaseStorage();
