import { Logger } from "@weldr/shared/logger";

import { type AgentFSInstance, openAgentFS } from "./agentfs";

interface ConnectionInfo {
  instance: AgentFSInstance;
  refCount: number;
  lastAccessed: number;
  branchDir: string;
}

/**
 * Centralized manager for AgentFS connections.
 * Uses acquire/release pattern with reference counting to manage connection lifecycle.
 *
 * This ensures multiple agents working on the same branch share the same SQLite connection,
 * preventing conflicts and improving performance.
 */
class SandboxConnectionManager {
  private connections = new Map<string, ConnectionInfo>();
  private logger = Logger.get({ service: "sandbox-connection-manager" });

  private getKey(projectId: string, branchId: string): string {
    return `${projectId}:${branchId}`;
  }

  /**
   * Acquire an AgentFS connection. Increments ref count.
   * Must call release() when done.
   */
  async acquire(projectId: string, branchId: string, branchDir: string): Promise<AgentFSInstance> {
    const key = this.getKey(projectId, branchId);

    const existing = this.connections.get(key);
    if (existing) {
      existing.refCount++;
      existing.lastAccessed = Date.now();
      this.logger.debug("Reusing sandbox connection", {
        extra: { key, refCount: existing.refCount },
      });
      return existing.instance;
    }

    this.logger.info("Opening new sandbox connection", { extra: { key } });
    const instance = await openAgentFS(branchDir);

    this.connections.set(key, {
      instance,
      refCount: 1,
      lastAccessed: Date.now(),
      branchDir,
    });

    return instance;
  }

  /**
   * Get an existing connection without incrementing ref count.
   * Returns undefined if no connection exists.
   * Use this for read-only access when you don't want to affect the lifecycle.
   */
  get(projectId: string, branchId: string): AgentFSInstance | undefined {
    const key = this.getKey(projectId, branchId);
    const info = this.connections.get(key);
    if (info) {
      info.lastAccessed = Date.now();
      return info.instance;
    }
    return undefined;
  }

  /**
   * Release an AgentFS connection. Decrements ref count.
   * Connection is closed when ref count reaches 0.
   */
  async release(projectId: string, branchId: string): Promise<void> {
    const key = this.getKey(projectId, branchId);
    const info = this.connections.get(key);

    if (!info) {
      this.logger.warn("Attempted to release non-existent connection", {
        extra: { key },
      });
      return;
    }

    info.refCount--;
    this.logger.debug("Released sandbox connection", {
      extra: { key, refCount: info.refCount },
    });

    if (info.refCount <= 0) {
      this.logger.info("Closing sandbox connection (refCount reached 0)", {
        extra: { key },
      });
      await info.instance.close();
      this.connections.delete(key);
    }
  }

  /**
   * Force close a connection regardless of ref count.
   * Use with caution - only at end of workflow.
   */
  async forceClose(projectId: string, branchId: string): Promise<void> {
    const key = this.getKey(projectId, branchId);
    const info = this.connections.get(key);

    if (info) {
      this.logger.info("Force closing sandbox connection", {
        extra: { key, refCount: info.refCount },
      });
      await info.instance.close();
      this.connections.delete(key);
    }
  }

  /**
   * Check if a connection exists for a branch.
   */
  has(projectId: string, branchId: string): boolean {
    return this.connections.has(this.getKey(projectId, branchId));
  }

  /**
   * Close all connections. Use at shutdown.
   */
  async closeAll(): Promise<void> {
    this.logger.info("Closing all sandbox connections", {
      extra: { count: this.connections.size },
    });

    for (const [key, info] of this.connections) {
      try {
        await info.instance.close();
        this.logger.debug("Closed connection", { extra: { key } });
      } catch (error) {
        this.logger.error("Failed to close connection", {
          extra: {
            key,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    this.connections.clear();
  }

  /**
   * Get connection stats for debugging.
   */
  getStats(): {
    key: string;
    refCount: number;
    lastAccessed: number;
    branchDir: string;
  }[] {
    return Array.from(this.connections.entries()).map(([key, info]) => ({
      key,
      refCount: info.refCount,
      lastAccessed: info.lastAccessed,
      branchDir: info.branchDir,
    }));
  }

  /**
   * Get the total number of active connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}

export const sandboxConnections = new SandboxConnectionManager();
