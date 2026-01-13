import type {
  AgentCheckpoint,
  AwaitingUserKind,
  PendingSpawnRequest,
  SessionState,
} from "@weldr/db/schema";

export type { AgentCheckpoint, AwaitingUserKind, PendingSpawnRequest, SessionState };

/**
 * Session state persisted in the database.
 * Used for reconstructing session actors from DB state.
 */
export type PersistedSessionState = {
  versionId: string;
  sessionState: SessionState;
  awaitingUserKind: AwaitingUserKind | null;
  traceId: string;
  currentMessageId: string | null;
  iterationCount: number;
  pendingSpawnRequests: PendingSpawnRequest[];
  assistantContentBuffer: string | null;
  pausedAt: Date | null;
  pauseReason: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

/**
 * Input for saving session state to database.
 */
export type SaveSessionStateInput = {
  versionId: string;
  sessionState: SessionState;
  awaitingUserKind?: AwaitingUserKind | null;
  traceId: string;
  currentMessageId?: string | null;
  iterationCount: number;
  pendingSpawnRequests?: PendingSpawnRequest[];
  assistantContentBuffer?: string | null;
  pausedAt?: Date | null;
  pauseReason?: string | null;
};

/**
 * Metrics stored in the versions table.
 */
export type VersionMetrics = {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  iterations: number;
  durationMs: number | null;
};

/**
 * Complete session snapshot including state and metrics.
 * Used when restoring a session actor.
 */
export type SessionSnapshot = {
  state: SessionState;
  awaitingUserKind: AwaitingUserKind | null;
  traceId: string;
  currentMessageId: string | null;
  iterationCount: number;
  pendingSpawnRequests: PendingSpawnRequest[];
  assistantContentBuffer: string | null;
  pausedAt: number | null;
  pauseReason: string | null;
  metrics: VersionMetrics;
};

/**
 * Storage interface for session persistence.
 */
export interface SessionStorage {
  saveSessionState(input: SaveSessionStateInput): Promise<void>;
  loadSessionState(versionId: string): Promise<SessionSnapshot | null>;
  deleteSessionState(versionId: string): Promise<void>;
  updateVersionMetrics(versionId: string, metrics: Partial<VersionMetrics>): Promise<void>;
}
