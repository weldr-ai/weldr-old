import type {
  AgentMetrics,
  CostInfo,
  LLMUsage,
  SerializedMetrics,
  SessionMetrics,
  ToolMetricEntry,
  ToolMetrics,
} from "./types";

type LlmRequestRecord = {
  usage: LLMUsage;
  cost: CostInfo;
  durationMs: number;
};

type ToolCallRecord = {
  toolName: string;
  success: boolean;
  durationMs: number;
};

export class MetricsCollector {
  private sessionStart = Date.now();
  private initializationDurationMs = 0;
  private finalizationDurationMs = 0;
  private iterations = 0;
  private totalAgentDurationMs = 0;
  private llmRequests: LlmRequestRecord[] = [];
  private toolCalls: ToolCallRecord[] = [];
  private subAgentSpawned = 0;
  private subAgentSuccess = 0;
  private subAgentFailure = 0;

  markInitialized(durationMs: number): void {
    this.initializationDurationMs = durationMs;
  }

  markFinalized(durationMs: number): void {
    this.finalizationDurationMs = durationMs;
  }

  recordIteration(): void {
    this.iterations += 1;
  }

  recordAgentDuration(durationMs: number): void {
    this.totalAgentDurationMs = durationMs;
  }

  recordLlmRequest(usage: LLMUsage, cost: CostInfo, durationMs: number): void {
    this.llmRequests.push({ usage, cost, durationMs });
  }

  recordToolCall(toolName: string, success: boolean, durationMs: number): void {
    this.toolCalls.push({ toolName, success, durationMs });
  }

  recordSubAgentResult(success: boolean): void {
    this.subAgentSpawned += 1;
    if (success) {
      this.subAgentSuccess += 1;
      return;
    }
    this.subAgentFailure += 1;
  }

  getMetrics(): SessionMetrics {
    return {
      totalDurationMs: Date.now() - this.sessionStart,
      initializationDurationMs: this.initializationDurationMs,
      finalizationDurationMs: this.finalizationDurationMs,
      agent: this.getAgentMetrics(),
    };
  }

  getAgentMetrics(): AgentMetrics {
    return this.buildAgentMetrics();
  }

  private buildAgentMetrics(): AgentMetrics {
    const totalLlm = this.llmRequests.reduce(
      (acc, record) => {
        return {
          inputTokens: acc.inputTokens + record.usage.inputTokens,
          outputTokens: acc.outputTokens + record.usage.outputTokens,
          totalTokens: acc.totalTokens + record.usage.totalTokens,
          totalCost: acc.totalCost + record.cost.totalCost,
          durationMs: acc.durationMs + record.durationMs,
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0, durationMs: 0 },
    );

    const llmRequests = this.llmRequests.length;
    const averageLatencyMs = llmRequests === 0 ? 0 : Math.round(totalLlm.durationMs / llmRequests);

    return {
      iterations: this.iterations,
      totalDurationMs: this.totalAgentDurationMs,
      llm: {
        requests: llmRequests,
        inputTokens: totalLlm.inputTokens,
        outputTokens: totalLlm.outputTokens,
        totalTokens: totalLlm.totalTokens,
        totalCost: totalLlm.totalCost,
        averageLatencyMs,
      },
      tools: this.getToolMetrics(),
      subAgents: {
        spawned: this.subAgentSpawned,
        successCount: this.subAgentSuccess,
        failureCount: this.subAgentFailure,
      },
    };
  }

  private getToolMetrics(): ToolMetrics {
    const byTool = this.toolCalls.reduce<Record<string, ToolMetricEntry>>((acc, record) => {
      const entry = acc[record.toolName] ?? {
        calls: 0,
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
      };

      entry.calls += 1;
      entry.totalDurationMs += record.durationMs;

      if (record.success) {
        entry.successCount += 1;
      } else {
        entry.failureCount += 1;
      }

      acc[record.toolName] = entry;
      return acc;
    }, {});

    const totals = Object.values(byTool).reduce(
      (acc, entry) => {
        return {
          calls: acc.calls + entry.calls,
          successCount: acc.successCount + entry.successCount,
          failureCount: acc.failureCount + entry.failureCount,
          totalDurationMs: acc.totalDurationMs + entry.totalDurationMs,
        };
      },
      { calls: 0, successCount: 0, failureCount: 0, totalDurationMs: 0 },
    );

    return {
      ...totals,
      byTool,
    };
  }

  serialize(): SerializedMetrics {
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
      toolCalls: this.toolCalls.map((t) => ({
        toolName: t.toolName,
        success: t.success,
        durationMs: t.durationMs,
      })),
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

  static deserialize(data: SerializedMetrics): MetricsCollector {
    const collector = new MetricsCollector();
    collector.sessionStart = data.sessionStartTimestamp;
    collector.initializationDurationMs = data.initializationDurationMs;
    collector.finalizationDurationMs = data.finalizationDurationMs;
    collector.iterations = data.iterations;
    collector.totalAgentDurationMs = data.totalAgentDurationMs;
    collector.subAgentSpawned = data.subAgentSpawned;
    collector.subAgentSuccess = data.subAgentSuccess;
    collector.subAgentFailure = data.subAgentFailure;

    collector.llmRequests = data.llmRequests.map(
      (r): LlmRequestRecord => ({
        usage: {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.totalTokens,
        },
        cost: {
          inputCost: r.inputCost,
          outputCost: r.outputCost,
          totalCost: r.totalCost,
        },
        durationMs: r.durationMs,
      }),
    );

    collector.toolCalls = data.toolCalls.map(
      (t): ToolCallRecord => ({
        toolName: t.toolName,
        success: t.success,
        durationMs: t.durationMs,
      }),
    );

    return collector;
  }
}
