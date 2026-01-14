import type { AgentFS } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

import type {
  SaveSessionStateInput,
  SessionSnapshot,
  SessionStorage,
  VersionMetrics,
} from "./types";

const KV_KEYS = {
  SESSION_STATE: "session:state",
  AWAITING_USER_KIND: "session:awaitingUserKind",
  TRACE_ID: "session:traceId",
  CURRENT_MESSAGE_ID: "session:currentMessageId",
  ITERATION_COUNT: "session:iterationCount",
  PENDING_SPAWN_REQUESTS: "session:pendingSpawnRequests",
  ASSISTANT_CONTENT_BUFFER: "session:assistantContentBuffer",
  PAUSED_AT: "session:pausedAt",
  PAUSE_REASON: "session:pauseReason",
  METRICS: "session:metrics",
} as const;

/**
 * AgentFS-backed session storage using SQLite KV store.
 *
 * Stores session state in the AgentFS KV store (SQLite) instead of PostgreSQL.
 * This enables full state reconstruction from the local SQLite database,
 * which is synced with cloud storage for recovery.
 */
export class AgentFSSessionStorage implements SessionStorage {
  private logger = Logger.get({ service: "agentfs-session-storage" });
  private agent: AgentFS;
  private versionId: string;

  constructor(agent: AgentFS, versionId: string) {
    this.agent = agent;
    this.versionId = versionId;
  }

  async saveSessionState(input: SaveSessionStateInput): Promise<void> {
    try {
      await Promise.all([
        this.agent.kv.set(KV_KEYS.SESSION_STATE, input.sessionState),
        this.agent.kv.set(KV_KEYS.AWAITING_USER_KIND, input.awaitingUserKind ?? null),
        this.agent.kv.set(KV_KEYS.TRACE_ID, input.traceId),
        this.agent.kv.set(KV_KEYS.CURRENT_MESSAGE_ID, input.currentMessageId ?? null),
        this.agent.kv.set(KV_KEYS.ITERATION_COUNT, input.iterationCount),
        this.agent.kv.set(KV_KEYS.PENDING_SPAWN_REQUESTS, input.pendingSpawnRequests ?? []),
        this.agent.kv.set(KV_KEYS.ASSISTANT_CONTENT_BUFFER, input.assistantContentBuffer ?? null),
        this.agent.kv.set(KV_KEYS.PAUSED_AT, input.pausedAt?.getTime() ?? null),
        this.agent.kv.set(KV_KEYS.PAUSE_REASON, input.pauseReason ?? null),
      ]);

      this.logger.debug("Session state saved to SQLite", {
        extra: {
          versionId: input.versionId,
          state: input.sessionState,
          iterationCount: input.iterationCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to save session state to SQLite", {
        extra: { versionId: input.versionId, error: message },
      });
      throw error;
    }
  }

  async loadSessionState(versionId: string): Promise<SessionSnapshot | null> {
    try {
      const [
        sessionState,
        awaitingUserKind,
        traceId,
        currentMessageId,
        iterationCount,
        pendingSpawnRequests,
        assistantContentBuffer,
        pausedAt,
        pauseReason,
        metrics,
      ] = await Promise.all([
        this.agent.kv.get<string>(KV_KEYS.SESSION_STATE),
        this.agent.kv.get<string | null>(KV_KEYS.AWAITING_USER_KIND),
        this.agent.kv.get<string>(KV_KEYS.TRACE_ID),
        this.agent.kv.get<string | null>(KV_KEYS.CURRENT_MESSAGE_ID),
        this.agent.kv.get<number>(KV_KEYS.ITERATION_COUNT),
        this.agent.kv.get<unknown[]>(KV_KEYS.PENDING_SPAWN_REQUESTS),
        this.agent.kv.get<string | null>(KV_KEYS.ASSISTANT_CONTENT_BUFFER),
        this.agent.kv.get<number | null>(KV_KEYS.PAUSED_AT),
        this.agent.kv.get<string | null>(KV_KEYS.PAUSE_REASON),
        this.agent.kv.get<VersionMetrics>(KV_KEYS.METRICS),
      ]);

      if (!sessionState || !traceId) {
        this.logger.debug("No session state found in SQLite", { extra: { versionId } });
        return null;
      }

      const snapshot: SessionSnapshot = {
        state: sessionState as SessionSnapshot["state"],
        awaitingUserKind: awaitingUserKind as SessionSnapshot["awaitingUserKind"],
        traceId,
        currentMessageId: currentMessageId ?? null,
        iterationCount: iterationCount ?? 0,
        pendingSpawnRequests: (pendingSpawnRequests ??
          []) as SessionSnapshot["pendingSpawnRequests"],
        assistantContentBuffer: assistantContentBuffer ?? null,
        pausedAt: pausedAt ?? null,
        pauseReason: pauseReason ?? null,
        metrics: metrics ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0,
          iterations: 0,
          durationMs: null,
        },
      };

      this.logger.debug("Session state loaded from SQLite", {
        extra: {
          versionId,
          state: snapshot.state,
          iterationCount: snapshot.iterationCount,
        },
      });

      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to load session state from SQLite", {
        extra: { versionId, error: message },
      });
      throw error;
    }
  }

  async deleteSessionState(_versionId: string): Promise<void> {
    try {
      await Promise.all([
        this.agent.kv.delete(KV_KEYS.SESSION_STATE),
        this.agent.kv.delete(KV_KEYS.AWAITING_USER_KIND),
        this.agent.kv.delete(KV_KEYS.TRACE_ID),
        this.agent.kv.delete(KV_KEYS.CURRENT_MESSAGE_ID),
        this.agent.kv.delete(KV_KEYS.ITERATION_COUNT),
        this.agent.kv.delete(KV_KEYS.PENDING_SPAWN_REQUESTS),
        this.agent.kv.delete(KV_KEYS.ASSISTANT_CONTENT_BUFFER),
        this.agent.kv.delete(KV_KEYS.PAUSED_AT),
        this.agent.kv.delete(KV_KEYS.PAUSE_REASON),
        this.agent.kv.delete(KV_KEYS.METRICS),
      ]);

      this.logger.debug("Session state deleted from SQLite", {
        extra: { versionId: this.versionId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to delete session state from SQLite", {
        extra: { versionId: this.versionId, error: message },
      });
      throw error;
    }
  }

  async updateVersionMetrics(_versionId: string, metrics: Partial<VersionMetrics>): Promise<void> {
    try {
      const existingMetrics = await this.agent.kv.get<VersionMetrics>(KV_KEYS.METRICS);
      const updatedMetrics: VersionMetrics = {
        inputTokens: metrics.inputTokens ?? existingMetrics?.inputTokens ?? 0,
        outputTokens: metrics.outputTokens ?? existingMetrics?.outputTokens ?? 0,
        totalCost: metrics.totalCost ?? existingMetrics?.totalCost ?? 0,
        iterations: metrics.iterations ?? existingMetrics?.iterations ?? 0,
        durationMs: metrics.durationMs ?? existingMetrics?.durationMs ?? null,
      };

      await this.agent.kv.set(KV_KEYS.METRICS, updatedMetrics);

      this.logger.debug("Version metrics updated in SQLite", {
        extra: { versionId: this.versionId, metrics: updatedMetrics },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to update version metrics in SQLite", {
        extra: { versionId: this.versionId, error: message },
      });
      throw error;
    }
  }

  /**
   * Get the AgentFS instance for direct access to tools and filesystem
   */
  getAgent(): AgentFS {
    return this.agent;
  }
}

/**
 * Create an AgentFS-backed session storage instance
 */
export function createAgentFSStorage(agent: AgentFS, versionId: string): AgentFSSessionStorage {
  return new AgentFSSessionStorage(agent, versionId);
}
