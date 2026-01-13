/**
 * Session Registry
 *
 * In-memory registry for managing session actors.
 * Maps versionId to ActorRef for active sessions.
 *
 * Key responsibilities:
 * - Get or create session actors based on versionId
 * - Restore state from database when creating new actors
 * - Wire up event forwarding to SSE
 * - Clean up actors when they complete/fail
 */

import { createActor, type AnyActorRef, type ActorRefFrom } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { createEventForwarder } from "@/core/events";
import { sessionStorage } from "@/core/persistence";
import { registerChatContext, unregisterChatContext } from "@/core/stream";
import type { BranchWithVersion, ProjectWithConfig, User } from "@/core/types";
import { sessionMachine, type SessionMachine } from "./machine";

type SessionActorRef = ActorRefFrom<SessionMachine>;

export type SessionRegistryEntry = {
  actor: SessionActorRef;
  createdAt: number;
  versionId: string;
  chatId: string;
};

export type GetOrCreateOptions = {
  versionId: string;
  traceId: string;
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
};

const logger = Logger.get({ service: "session-registry" });

class SessionRegistry {
  private sessions = new Map<string, SessionRegistryEntry>();
  private cleanupHandles = new Map<string, () => void>();

  /**
   * Get an existing session or create a new one.
   * If a session exists and is still active, returns it.
   * Otherwise, loads state from database and creates a new actor.
   */
  async getOrCreate(options: GetOrCreateOptions): Promise<SessionActorRef> {
    const { versionId, traceId, project, branch, user } = options;

    // Check for existing active session
    const existing = this.sessions.get(versionId);
    if (existing && this.isActorActive(existing.actor)) {
      logger.debug("Returning existing session", { extra: { versionId } });
      return existing.actor;
    }

    // Clean up stale entry if exists
    if (existing) {
      this.cleanupSession(versionId);
    }

    // Load state from database
    const snapshot = await sessionStorage.loadSessionState(versionId);

    logger.info("Creating new session actor", {
      extra: {
        versionId,
        traceId,
        restoredState: snapshot?.state ?? "fresh",
        restoredIterations: snapshot?.iterationCount ?? 0,
      },
    });

    // Create the actor
    const actor = createActor(sessionMachine, {
      input: {
        versionId,
        traceId,
        project,
        branch,
        user,
        restoredSnapshot: snapshot,
      },
    });

    // Wire up event forwarding to SSE
    const chatId = branch.headVersion.chatId;

    // Register chat context for durable streams
    registerChatContext(chatId, project.id, branch.id);

    const eventForwarder = createEventForwarder(chatId);
    const subscription = actor.on("*", (event) => {
      eventForwarder({
        ...event,
        timestamp: Date.now(),
        versionId,
        traceId,
      }).catch((error: Error) => {
        logger.error("Failed to forward event", {
          extra: { versionId, eventType: event.type, error: error.message },
        });
      });
    });

    // Register cleanup when actor finishes
    const statusSubscription = actor.subscribe({
      complete: () => this.cleanupSession(versionId),
      error: () => this.cleanupSession(versionId),
    });

    // Store cleanup handles
    this.cleanupHandles.set(versionId, () => {
      subscription.unsubscribe();
      statusSubscription.unsubscribe();
    });

    // Register the session
    this.sessions.set(versionId, {
      actor,
      createdAt: Date.now(),
      versionId,
      chatId,
    });

    // Start the actor
    actor.start();

    logger.info("Session actor started", { extra: { versionId } });

    return actor;
  }

  /**
   * Get a session if it exists and is active.
   */
  get(versionId: string): SessionActorRef | undefined {
    const entry = this.sessions.get(versionId);
    if (entry && this.isActorActive(entry.actor)) {
      return entry.actor;
    }
    return undefined;
  }

  /**
   * Check if a session exists and is active.
   */
  has(versionId: string): boolean {
    return this.get(versionId) !== undefined;
  }

  /**
   * Clean up a session and remove it from the registry.
   */
  private cleanupSession(versionId: string): void {
    const entry = this.sessions.get(versionId);
    if (!entry) {
      return;
    }

    // Run cleanup handles
    const cleanup = this.cleanupHandles.get(versionId);
    if (cleanup) {
      cleanup();
      this.cleanupHandles.delete(versionId);
    }

    // Unregister chat context for durable streams
    unregisterChatContext(entry.chatId);

    // Stop the actor if still running
    try {
      if (this.isActorActive(entry.actor)) {
        entry.actor.stop();
      }
    } catch {
      // Ignore errors when stopping
    }

    this.sessions.delete(versionId);

    logger.debug("Session cleaned up", { extra: { versionId } });
  }

  /**
   * Check if an actor is still active (not stopped/done/error).
   */
  private isActorActive(actor: AnyActorRef): boolean {
    try {
      const snapshot = actor.getSnapshot();
      return snapshot.status === "active";
    } catch {
      return false;
    }
  }

  /**
   * Get statistics about active sessions.
   */
  getStats(): { activeSessions: number; sessions: string[] } {
    const activeSessions: string[] = [];
    for (const [versionId, entry] of this.sessions) {
      if (this.isActorActive(entry.actor)) {
        activeSessions.push(versionId);
      }
    }

    return {
      activeSessions: activeSessions.length,
      sessions: activeSessions,
    };
  }

  /**
   * Stop all sessions (for graceful shutdown).
   */
  shutdown(): void {
    logger.info("Shutting down session registry", {
      extra: { activeSessions: this.sessions.size },
    });

    for (const versionId of this.sessions.keys()) {
      this.cleanupSession(versionId);
    }
  }
}

// Singleton instance
export const sessionRegistry = new SessionRegistry();
