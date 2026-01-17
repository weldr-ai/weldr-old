/**
 * Session Registry
 *
 * In-memory registry for managing session actors.
 * Maps chatId to ActorRef for active sessions.
 *
 * Key responsibilities:
 * - Get or create session actors based on chatId
 * - Restore state from database when creating new actors
 * - Wire up event forwarding to SSE
 * - Clean up actors when they complete/fail
 */

import os from "node:os";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";
import { createActor, type AnyActorRef, type ActorRefFrom } from "xstate";

import { Logger } from "@weldr/shared/logger";

import { createEventForwarder } from "@/core/events";
import { createAgentFSStorage } from "@/core/persistence";
import { registerChatContext, unregisterChatContext } from "@/core/stream";
import type { BranchWithSnapshot, ProjectWithConfig, User } from "@/core/types";
import { sessionMachine, type SessionMachine } from "./machine";

type SessionActorRef = ActorRefFrom<SessionMachine>;

export type SessionRegistryEntry = {
  actor: SessionActorRef;
  agent: AgentFS;
  createdAt: number;
  chatId: string;
  branchId: string;
};

export type GetOrCreateOptions = {
  chatId: string;
  traceId: string;
  project: ProjectWithConfig;
  branch: BranchWithSnapshot;
  user: User;
};

const logger = Logger.get({ service: "session-registry" });

class SessionRegistry {
  private sessions = new Map<string, SessionRegistryEntry>();
  private cleanupHandles = new Map<string, () => void>();

  /**
   * Get an existing session or create a new one.
   * If a session exists and is still active, returns it.
   * Otherwise, opens AgentFS, loads state from SQLite, and creates actor.
   */
  async getOrCreate(options: GetOrCreateOptions): Promise<SessionActorRef> {
    const { chatId, traceId, project, branch, user } = options;

    // Check for existing active session
    const existing = this.sessions.get(chatId);
    if (existing && this.isActorActive(existing.actor)) {
      logger.debug("Returning existing session", { extra: { chatId } });
      return existing.actor;
    }

    // Clean up stale entry if exists
    if (existing) {
      this.cleanupSession(chatId);
    }

    // Open AgentFS SQLite database (keyed by branch for isolation)
    const dbPath = path.join(os.homedir(), ".weldr", "db", `${branch.id}.db`);
    const agent = await AgentFS.open({ path: dbPath });

    // Create storage interface for this chat
    const storage = createAgentFSStorage(agent, chatId);

    // Load workflow state from SQLite
    const snapshot = await storage.loadSessionState(chatId);

    logger.info("Creating new session actor", {
      extra: {
        chatId,
        branchId: branch.id,
        traceId,
        restoredState: snapshot?.state ?? "fresh",
        restoredIterations: snapshot?.iterationCount ?? 0,
      },
    });

    // Create the actor with AgentFS storage
    const actor = createActor(sessionMachine, {
      input: {
        chatId,
        traceId,
        project,
        branch,
        user,
        restoredSnapshot: snapshot,
        storage,
      },
    });

    // Register chat context for durable streams
    registerChatContext(chatId, project.id, branch.id);

    const eventForwarder = createEventForwarder(chatId);
    const subscription = actor.on("*", (event) => {
      eventForwarder({
        ...event,
        timestamp: Date.now(),
        chatId,
        traceId,
      }).catch((error: Error) => {
        logger.error("Failed to forward event", {
          extra: { chatId, eventType: event.type, error: error.message },
        });
      });
    });

    // Register cleanup when actor finishes
    const statusSubscription = actor.subscribe({
      complete: () => this.cleanupSession(chatId),
      error: () => this.cleanupSession(chatId),
    });

    // Store cleanup handles
    this.cleanupHandles.set(chatId, () => {
      subscription.unsubscribe();
      statusSubscription.unsubscribe();
    });

    // Register the session
    this.sessions.set(chatId, {
      actor,
      agent,
      createdAt: Date.now(),
      chatId,
      branchId: branch.id,
    });

    // Start the actor
    actor.start();

    logger.info("Session actor started", { extra: { chatId } });

    return actor;
  }

  /**
   * Get a session if it exists and is active.
   */
  get(chatId: string): SessionActorRef | undefined {
    const entry = this.sessions.get(chatId);
    if (entry && this.isActorActive(entry.actor)) {
      return entry.actor;
    }
    return undefined;
  }

  /**
   * Check if a session exists and is active.
   */
  has(chatId: string): boolean {
    return this.get(chatId) !== undefined;
  }

  /**
   * Clean up a session and remove it from the registry.
   */
  private cleanupSession(chatId: string): void {
    const entry = this.sessions.get(chatId);
    if (!entry) {
      return;
    }

    // Run cleanup handles
    const cleanup = this.cleanupHandles.get(chatId);
    if (cleanup) {
      cleanup();
      this.cleanupHandles.delete(chatId);
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

    this.sessions.delete(chatId);

    logger.debug("Session cleaned up", { extra: { chatId } });
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
    for (const [chatId, entry] of this.sessions) {
      if (this.isActorActive(entry.actor)) {
        activeSessions.push(chatId);
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

    for (const chatId of this.sessions.keys()) {
      this.cleanupSession(chatId);
    }
  }
}

// Singleton instance
export const sessionRegistry = new SessionRegistry();
