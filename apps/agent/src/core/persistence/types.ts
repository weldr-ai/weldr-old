/**
 * Session state types
 * Previously stored in PostgreSQL, now stored in SQLite via AgentFS
 */

export type SessionState =
  | "idle"
  | "initializing"
  | "processing"
  | "awaitingUser"
  | "paused"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type AwaitingUserKind = "message" | "confirmation" | "selection";

export type PendingSpawnRequest = {
  toolCallId: string;
  agents: Array<{
    id: string;
    task: string;
    context?: string;
    depends?: string[];
  }>;
};

export type AgentCheckpoint = {
  iterationCount: number;
  messageId: string;
  pendingSpawnRequests: PendingSpawnRequest[];
  assistantContentBuffer: string | null;
};

/**
 * Session state persisted in the database.
 * Used for reconstructing session actors from DB state.
 */
export type PersistedSessionState = {
  chatId: string;
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
  chatId: string;
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
 * Metrics stored in the snapshots table.
 */
export type SnapshotMetrics = {
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
  metrics: SnapshotMetrics;
};

/**
 * Storage interface for session persistence.
 */
export interface SessionStorage {
  saveSessionState(input: SaveSessionStateInput): Promise<void>;
  loadSessionState(chatId: string): Promise<SessionSnapshot | null>;
  deleteSessionState(chatId: string): Promise<void>;
  updateChatMetrics(chatId: string, metrics: Partial<SnapshotMetrics>): Promise<void>;
}
