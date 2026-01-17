import type { AgentFS } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

import { createToolTracker, type ToolTracker } from "../persistence/tool-tracker";
import type {
  AgentMetrics,
  CostInfo,
  LLMUsage,
  SerializedMetrics,
  SessionMetrics,
  ToolMetricEntry,
  ToolMetrics,
} from "./types";

const KV_KEYS = {
  LLM_REQUESTS: "metrics:llmRequests",
  SESSION_START: "metrics:sessionStart",
  INITIALIZATION_DURATION: "metrics:initializationDurationMs",
  FINALIZATION_DURATION: "metrics:finalizationDurationMs",
  ITERATIONS: "metrics:iterations",
  TOTAL_AGENT_DURATION: "metrics:totalAgentDurationMs",
  SUB_AGENT_SPAWNED: "metrics:subAgentSpawned",
  SUB_AGENT_SUCCESS: "metrics:subAgentSuccess",
  SUB_AGENT_FAILURE: "metrics:subAgentFailure",
} as const;

type LlmRequestRecord = {
  usage: LLMUsage;
  cost: CostInfo;
  durationMs: number;
  timestamp: number;
};

/**
 * AgentFS-backed metrics collector that persists all metrics to SQLite.
 *
 * Key differences from the in-memory MetricsCollector:
 * - Tool calls are tracked via AgentFS `agent.tools` API with full parameters/results
 * - LLM requests and other metrics are persisted to AgentFS KV store
 * - All data is recoverable from the SQLite database
 */
export class AgentFSMetricsCollector {
  private logger = Logger.get({ service: "agentfs-metrics" });
  private agent: AgentFS;
  private toolTracker: ToolTracker;
  private sessionStart: number;
  private initializationDurationMs = 0;
  private finalizationDurationMs = 0;
  private iterations = 0;
  private totalAgentDurationMs = 0;
  private llmRequests: LlmRequestRecord[] = [];
  private subAgentSpawned = 0;
  private subAgentSuccess = 0;
  private subAgentFailure = 0;
  private initialized = false;

  constructor(agent: AgentFS) {
    this.agent = agent;
    this.toolTracker = createToolTracker(agent);
    this.sessionStart = Date.now();
  }

  /**
   * Initialize the collector, loading any existing state from SQLite
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const [
        sessionStart,
        initDuration,
        finalDuration,
        iterations,
        agentDuration,
        llmRequests,
        subSpawned,
        subSuccess,
        subFailure,
      ] = await Promise.all([
        this.agent.kv.get<number>(KV_KEYS.SESSION_START),
        this.agent.kv.get<number>(KV_KEYS.INITIALIZATION_DURATION),
        this.agent.kv.get<number>(KV_KEYS.FINALIZATION_DURATION),
        this.agent.kv.get<number>(KV_KEYS.ITERATIONS),
        this.agent.kv.get<number>(KV_KEYS.TOTAL_AGENT_DURATION),
        this.agent.kv.get<LlmRequestRecord[]>(KV_KEYS.LLM_REQUESTS),
        this.agent.kv.get<number>(KV_KEYS.SUB_AGENT_SPAWNED),
        this.agent.kv.get<number>(KV_KEYS.SUB_AGENT_SUCCESS),
        this.agent.kv.get<number>(KV_KEYS.SUB_AGENT_FAILURE),
      ]);

      this.sessionStart = sessionStart ?? this.sessionStart;
      this.initializationDurationMs = initDuration ?? 0;
      this.finalizationDurationMs = finalDuration ?? 0;
      this.iterations = iterations ?? 0;
      this.totalAgentDurationMs = agentDuration ?? 0;
      this.llmRequests = llmRequests ?? [];
      this.subAgentSpawned = subSpawned ?? 0;
      this.subAgentSuccess = subSuccess ?? 0;
      this.subAgentFailure = subFailure ?? 0;

      if (!sessionStart) {
        await this.agent.kv.set(KV_KEYS.SESSION_START, this.sessionStart);
      }

      this.initialized = true;
      this.logger.debug("Metrics collector initialized from SQLite", {
        extra: { iterations: this.iterations, llmRequests: this.llmRequests.length },
      });
    } catch (error) {
      this.logger.error("Failed to initialize metrics from SQLite", {
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
      this.initialized = true;
    }
  }

  async markInitialized(durationMs: number): Promise<void> {
    this.initializationDurationMs = durationMs;
    await this.agent.kv.set(KV_KEYS.INITIALIZATION_DURATION, durationMs);
  }

  async markFinalized(durationMs: number): Promise<void> {
    this.finalizationDurationMs = durationMs;
    await this.agent.kv.set(KV_KEYS.FINALIZATION_DURATION, durationMs);
  }

  async recordIteration(): Promise<void> {
    this.iterations += 1;
    await this.agent.kv.set(KV_KEYS.ITERATIONS, this.iterations);
  }

  async recordAgentDuration(durationMs: number): Promise<void> {
    this.totalAgentDurationMs = durationMs;
    await this.agent.kv.set(KV_KEYS.TOTAL_AGENT_DURATION, durationMs);
  }

  async recordLlmRequest(usage: LLMUsage, cost: CostInfo, durationMs: number): Promise<void> {
    const record: LlmRequestRecord = {
      usage,
      cost,
      durationMs,
      timestamp: Date.now(),
    };
    this.llmRequests.push(record);
    await this.agent.kv.set(KV_KEYS.LLM_REQUESTS, this.llmRequests);
  }

  /**
   * Start tracking a tool call. Returns the tool call ID.
   */
  async startToolCall(toolName: string, parameters?: unknown): Promise<number> {
    return this.toolTracker.start({ toolName, parameters });
  }

  /**
   * Complete a tool call with success
   */
  async completeToolCallSuccess(id: number, result?: unknown): Promise<void> {
    await this.toolTracker.complete(id, { success: true, result });
  }

  /**
   * Complete a tool call with error
   */
  async completeToolCallError(id: number, error: string): Promise<void> {
    await this.toolTracker.complete(id, { success: false, error });
  }

  /**
   * Record a completed tool call (for backwards compatibility)
   */
  async recordToolCall(
    toolName: string,
    success: boolean,
    durationMs: number,
    parameters?: unknown,
    result?: unknown,
    error?: string,
  ): Promise<void> {
    const now = Date.now();
    const startedAt = now - durationMs;
    await this.toolTracker.record(
      toolName,
      startedAt,
      now,
      parameters,
      success ? result : undefined,
      success ? undefined : (error ?? "Unknown error"),
    );
  }

  async recordSubAgentResult(success: boolean): Promise<void> {
    this.subAgentSpawned += 1;
    if (success) {
      this.subAgentSuccess += 1;
    } else {
      this.subAgentFailure += 1;
    }

    await Promise.all([
      this.agent.kv.set(KV_KEYS.SUB_AGENT_SPAWNED, this.subAgentSpawned),
      this.agent.kv.set(KV_KEYS.SUB_AGENT_SUCCESS, this.subAgentSuccess),
      this.agent.kv.set(KV_KEYS.SUB_AGENT_FAILURE, this.subAgentFailure),
    ]);
  }

  async getMetrics(): Promise<SessionMetrics> {
    return {
      totalDurationMs: Date.now() - this.sessionStart,
      initializationDurationMs: this.initializationDurationMs,
      finalizationDurationMs: this.finalizationDurationMs,
      agent: await this.getAgentMetrics(),
    };
  }

  async getAgentMetrics(): Promise<AgentMetrics> {
    const toolStats = await this.toolTracker.getStats();

    const totalLlm = this.llmRequests.reduce(
      (acc, record) => ({
        inputTokens: acc.inputTokens + record.usage.inputTokens,
        outputTokens: acc.outputTokens + record.usage.outputTokens,
        totalTokens: acc.totalTokens + record.usage.totalTokens,
        totalCost: acc.totalCost + record.cost.totalCost,
        durationMs: acc.durationMs + record.durationMs,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, durationMs: 0 },
    );

    const llmRequestCount = this.llmRequests.length;
    const averageLatencyMs =
      llmRequestCount === 0 ? 0 : Math.round(totalLlm.durationMs / llmRequestCount);

    const byTool: Record<string, ToolMetricEntry> = {};
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalToolDuration = 0;

    for (const stat of toolStats) {
      byTool[stat.name] = {
        calls: stat.total_calls,
        successCount: stat.successful,
        failureCount: stat.failed,
        totalDurationMs: Math.round(stat.avg_duration_ms * stat.total_calls),
      };
      totalCalls += stat.total_calls;
      totalSuccess += stat.successful;
      totalFailure += stat.failed;
      totalToolDuration += Math.round(stat.avg_duration_ms * stat.total_calls);
    }

    const tools: ToolMetrics = {
      calls: totalCalls,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalDurationMs: totalToolDuration,
      byTool,
    };

    return {
      iterations: this.iterations,
      totalDurationMs: this.totalAgentDurationMs,
      llm: {
        requests: llmRequestCount,
        inputTokens: totalLlm.inputTokens,
        outputTokens: totalLlm.outputTokens,
        totalTokens: totalLlm.totalTokens,
        totalCost: totalLlm.totalCost,
        averageLatencyMs,
      },
      tools,
      subAgents: {
        spawned: this.subAgentSpawned,
        successCount: this.subAgentSuccess,
        failureCount: this.subAgentFailure,
      },
    };
  }

  /**
   * Get the tool tracker for direct access to tool call history
   */
  getToolTracker(): ToolTracker {
    return this.toolTracker;
  }

  /**
   * Get the AgentFS instance
   */
  getAgent(): AgentFS {
    return this.agent;
  }

  /**
   * Serialize metrics for transport/storage (backwards compatibility)
   */
  async serialize(): Promise<SerializedMetrics> {
    const toolStats = await this.toolTracker.getStats();

    const toolCalls = toolStats.flatMap((stat) => {
      const calls: { toolName: string; success: boolean; durationMs: number }[] = [];
      for (let i = 0; i < stat.successful; i++) {
        calls.push({
          toolName: stat.name,
          success: true,
          durationMs: Math.round(stat.avg_duration_ms),
        });
      }
      for (let i = 0; i < stat.failed; i++) {
        calls.push({
          toolName: stat.name,
          success: false,
          durationMs: Math.round(stat.avg_duration_ms),
        });
      }
      return calls;
    });

    return {
      llmRequests: this.llmRequests.map((r) => ({
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        totalTokens: r.usage.totalTokens,
        inputCost: r.cost.inputCost,
        outputCost: r.cost.outputCost,
        totalCost: r.cost.totalCost,
        durationMs: r.durationMs,
      })),
      toolCalls,
      iterations: this.iterations,
      subAgentSpawned: this.subAgentSpawned,
      subAgentSuccess: this.subAgentSuccess,
      subAgentFailure: this.subAgentFailure,
      sessionStartTimestamp: this.sessionStart,
      initializationDurationMs: this.initializationDurationMs,
      finalizationDurationMs: this.finalizationDurationMs,
      totalAgentDurationMs: this.totalAgentDurationMs,
    };
  }
}

/**
 * Create an AgentFS-backed metrics collector
 */
export async function createAgentFSMetricsCollector(
  agent: AgentFS,
): Promise<AgentFSMetricsCollector> {
  const collector = new AgentFSMetricsCollector(agent);
  await collector.initialize();
  return collector;
}
