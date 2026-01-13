export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CostInfo = {
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

export type ToolMetricEntry = {
  calls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
};

export type ToolMetrics = {
  calls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  byTool: Record<string, ToolMetricEntry>;
};

export type AgentMetrics = {
  iterations: number;
  totalDurationMs: number;
  llm: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost: number;
    averageLatencyMs: number;
  };
  tools: ToolMetrics;
  subAgents: {
    spawned: number;
    successCount: number;
    failureCount: number;
  };
};

export type SessionMetrics = {
  totalDurationMs: number;
  initializationDurationMs: number;
  finalizationDurationMs: number;
  agent: AgentMetrics;
};

/**
 * Serialized format for metrics storage/transport.
 */
export type SerializedLlmRequest = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  durationMs: number;
};

export type SerializedToolCall = {
  toolName: string;
  success: boolean;
  durationMs: number;
};

export type SerializedMetrics = {
  llmRequests: SerializedLlmRequest[];
  toolCalls: SerializedToolCall[];
  iterations: number;
  subAgentSpawned: number;
  subAgentSuccess: number;
  subAgentFailure: number;
  sessionStartTimestamp: number;
  initializationDurationMs: number;
  finalizationDurationMs: number;
  totalAgentDurationMs: number;
};
