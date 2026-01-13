import type { AssistantContent } from "ai";

export type { BranchWithVersion, ProjectWithConfig } from "@/core/types";

export type PendingAgentTask = {
  task: string;
  context?: string;
};

export type PendingSpawnRequest = {
  toolCallId: string;
  agents: PendingAgentTask[];
};

export type SubAgentResult = {
  task: string;
  success: boolean;
  result: string;
};

export type SubAgentBatchResult = {
  toolCallId: string;
  results: SubAgentResult[];
};

export type FinishReason =
  | "length"
  | "stop"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AssistantContentArray = Exclude<AssistantContent, string>;
