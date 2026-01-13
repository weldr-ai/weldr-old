import { db, eq } from "@weldr/db";
import { versions, versionSessions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type {
  SaveSessionStateInput,
  SessionSnapshot,
  SessionStorage,
  VersionMetrics,
} from "./types";

/**
 * Database-backed session storage.
 *
 * Stores session state in the version_sessions table and metrics in the versions table.
 * This enables full state reconstruction when a new request arrives.
 */
export class SessionDatabaseStorage implements SessionStorage {
  private logger = Logger.get({ service: "session-storage" });

  async saveSessionState(input: SaveSessionStateInput): Promise<void> {
    try {
      await db
        .insert(versionSessions)
        .values({
          versionId: input.versionId,
          sessionState: input.sessionState,
          awaitingUserKind: input.awaitingUserKind ?? null,
          traceId: input.traceId,
          currentMessageId: input.currentMessageId ?? null,
          iterationCount: input.iterationCount,
          pendingSpawnRequests: input.pendingSpawnRequests ?? [],
          assistantContentBuffer: input.assistantContentBuffer ?? null,
          pausedAt: input.pausedAt ?? null,
          pauseReason: input.pauseReason ?? null,
        })
        .onConflictDoUpdate({
          target: versionSessions.versionId,
          set: {
            sessionState: input.sessionState,
            awaitingUserKind: input.awaitingUserKind ?? null,
            currentMessageId: input.currentMessageId ?? null,
            iterationCount: input.iterationCount,
            pendingSpawnRequests: input.pendingSpawnRequests ?? [],
            assistantContentBuffer: input.assistantContentBuffer ?? null,
            pausedAt: input.pausedAt ?? null,
            pauseReason: input.pauseReason ?? null,
            updatedAt: new Date(),
          },
        });

      this.logger.debug("Session state saved", {
        extra: {
          versionId: input.versionId,
          state: input.sessionState,
          iterationCount: input.iterationCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to save session state", {
        extra: { versionId: input.versionId, error: message },
      });
      throw error;
    }
  }

  async loadSessionState(versionId: string): Promise<SessionSnapshot | null> {
    try {
      const sessionRecord = await db.query.versionSessions.findFirst({
        where: eq(versionSessions.versionId, versionId),
      });

      if (!sessionRecord) {
        this.logger.debug("No session state found", { extra: { versionId } });
        return null;
      }

      const versionRecord = await db.query.versions.findFirst({
        where: eq(versions.id, versionId),
        columns: {
          inputTokens: true,
          outputTokens: true,
          totalCost: true,
          iterations: true,
          durationMs: true,
        },
      });

      const metrics: VersionMetrics = {
        inputTokens: versionRecord?.inputTokens ?? 0,
        outputTokens: versionRecord?.outputTokens ?? 0,
        totalCost: versionRecord?.totalCost ?? 0,
        iterations: versionRecord?.iterations ?? 0,
        durationMs: versionRecord?.durationMs ?? null,
      };

      const snapshot: SessionSnapshot = {
        state: sessionRecord.sessionState,
        awaitingUserKind: sessionRecord.awaitingUserKind,
        traceId: sessionRecord.traceId,
        currentMessageId: sessionRecord.currentMessageId,
        iterationCount: sessionRecord.iterationCount,
        pendingSpawnRequests: sessionRecord.pendingSpawnRequests,
        assistantContentBuffer: sessionRecord.assistantContentBuffer,
        pausedAt: sessionRecord.pausedAt?.getTime() ?? null,
        pauseReason: sessionRecord.pauseReason,
        metrics,
      };

      this.logger.debug("Session state loaded", {
        extra: {
          versionId,
          state: snapshot.state,
          iterationCount: snapshot.iterationCount,
        },
      });

      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to load session state", {
        extra: { versionId, error: message },
      });
      throw error;
    }
  }

  async deleteSessionState(versionId: string): Promise<void> {
    try {
      await db.delete(versionSessions).where(eq(versionSessions.versionId, versionId));

      this.logger.debug("Session state deleted", { extra: { versionId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to delete session state", {
        extra: { versionId, error: message },
      });
      throw error;
    }
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
