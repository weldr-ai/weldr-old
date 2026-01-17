import type { AgentFS, ToolCall, ToolCallStats } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

/**
 * Tool call input parameters for tracking
 */
export interface ToolCallInput {
  toolName: string;
  parameters?: unknown;
}

/**
 * Tool call result for completing a tracked call
 */
export interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Tracked tool call with timing info
 */
export interface TrackedToolCall {
  id: number;
  toolName: string;
  startedAt: number;
}

/**
 * Tool tracker that persists all tool calls to AgentFS SQLite database.
 *
 * Uses the AgentFS `agent.tools` API which provides:
 * - start(name, parameters) -> id
 * - success(id, result)
 * - error(id, errorMessage)
 * - record(name, started_at, completed_at, parameters?, result?, error?)
 * - get(id) -> ToolCall
 * - getByName(name, limit?) -> ToolCall[]
 * - getRecent(since, limit?) -> ToolCall[]
 * - getStats() -> ToolCallStats[]
 */
export class ToolTracker {
  private logger = Logger.get({ service: "tool-tracker" });
  private agent: AgentFS;
  private pendingCalls = new Map<number, TrackedToolCall>();

  constructor(agent: AgentFS) {
    this.agent = agent;
  }

  /**
   * Start tracking a tool call.
   * Returns a tool call ID that must be used to complete the call.
   */
  async start(input: ToolCallInput): Promise<number> {
    try {
      const id = await this.agent.tools.start(input.toolName, input.parameters);

      this.pendingCalls.set(id, {
        id,
        toolName: input.toolName,
        startedAt: Date.now(),
      });

      this.logger.debug("Tool call started", {
        extra: { id, toolName: input.toolName },
      });

      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to start tool call tracking", {
        extra: { toolName: input.toolName, error: message },
      });
      throw error;
    }
  }

  /**
   * Complete a tool call with success or failure.
   */
  async complete(id: number, result: ToolCallResult): Promise<void> {
    const pending = this.pendingCalls.get(id);

    try {
      if (result.success) {
        await this.agent.tools.success(id, result.result);
      } else {
        await this.agent.tools.error(id, result.error ?? "Unknown error");
      }

      this.pendingCalls.delete(id);

      this.logger.debug("Tool call completed", {
        extra: {
          id,
          toolName: pending?.toolName,
          success: result.success,
          durationMs: pending ? Date.now() - pending.startedAt : undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to complete tool call tracking", {
        extra: { id, toolName: pending?.toolName, error: message },
      });
      throw error;
    }
  }

  /**
   * Record a completed tool call in one step.
   * Useful for recording tool calls after the fact.
   */
  async record(
    toolName: string,
    startedAt: number,
    completedAt: number,
    parameters?: unknown,
    result?: unknown,
    error?: string,
  ): Promise<number> {
    try {
      const id = await this.agent.tools.record(
        toolName,
        startedAt,
        completedAt,
        parameters,
        result,
        error,
      );

      this.logger.debug("Tool call recorded", {
        extra: {
          id,
          toolName,
          durationMs: completedAt - startedAt,
          success: !error,
        },
      });

      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("Failed to record tool call", {
        extra: { toolName, error: message },
      });
      throw err;
    }
  }

  /**
   * Get a specific tool call by ID
   */
  async get(id: number): Promise<ToolCall | undefined> {
    return this.agent.tools.get(id);
  }

  /**
   * Get tool calls by name
   */
  async getByName(toolName: string, limit?: number): Promise<ToolCall[]> {
    return this.agent.tools.getByName(toolName, limit);
  }

  /**
   * Get recent tool calls since a timestamp
   */
  async getRecent(since: number, limit?: number): Promise<ToolCall[]> {
    return this.agent.tools.getRecent(since, limit);
  }

  /**
   * Get statistics for all tools
   */
  async getStats(): Promise<ToolCallStats[]> {
    return this.agent.tools.getStats();
  }

  /**
   * Get all pending (in-progress) tool calls
   */
  getPending(): TrackedToolCall[] {
    return Array.from(this.pendingCalls.values());
  }

  /**
   * Check if there are any pending tool calls
   */
  hasPending(): boolean {
    return this.pendingCalls.size > 0;
  }

  /**
   * Get the AgentFS instance
   */
  getAgent(): AgentFS {
    return this.agent;
  }
}

/**
 * Create a tool tracker for an AgentFS instance
 */
export function createToolTracker(agent: AgentFS): ToolTracker {
  return new ToolTracker(agent);
}
