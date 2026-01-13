import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { versions } from "./branches-versions";

/**
 * Session state for the unified actor model.
 *
 * This table stores the current state of a version's session, enabling:
 * - State reconstruction when a new request arrives
 * - Persistence of agent checkpoints between iterations
 * - Tracking of awaiting user state for conversational flows
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

export const versionSessions = pgTable(
  "version_sessions",
  {
    versionId: text("version_id")
      .primaryKey()
      .references(() => versions.id, { onDelete: "cascade" }),

    // Session state
    sessionState: text("session_state").$type<SessionState>().notNull().default("idle"),
    awaitingUserKind: text("awaiting_user_kind").$type<AwaitingUserKind | null>(),

    // Trace for distributed logging
    traceId: text("trace_id").notNull(),

    // Agent checkpoint
    currentMessageId: text("current_message_id"),
    iterationCount: integer("iteration_count").default(0).notNull(),
    pendingSpawnRequests: jsonb("pending_spawn_requests")
      .$type<PendingSpawnRequest[]>()
      .default([])
      .notNull(),
    assistantContentBuffer: text("assistant_content_buffer"),

    // Pause state
    pausedAt: timestamp("paused_at"),
    pauseReason: text("pause_reason"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("version_sessions_state_idx").on(t.sessionState)],
);
