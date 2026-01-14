import type { AssistantContent, ModelMessage, ToolSet } from "ai";
import type { AnyActorRef } from "xstate";

import type { AiModel } from "@weldr/db/schema";

import type {
  FinishReason,
  PendingSpawnRequest,
  SubAgentResult,
  SubAgentTask,
} from "@/core/events/types";
import type { LLMUsage, MetricsCollector } from "@/core/metrics";
import type { BranchWithVersion, ProjectWithConfig, User } from "@/core/types";

export type { FinishReason, PendingSpawnRequest, SubAgentResult, SubAgentTask };

export type PendingAgentTask = SubAgentTask;

export type SubAgentBatchResult = {
  toolCallId: string;
  results: SubAgentResult[];
};

export type AssistantContentArray = Exclude<AssistantContent, string>;

export type AgentContext = {
  agentId: string;
  isSubAgent: boolean;
  parentAgentId?: string;
  task?: string;
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
  messages: ModelMessage[];
  assistantContent: AssistantContentArray;
  messageId: string;
  iterationCount: number;
  iterationStartedAt: number | null;
  agentStartedAt: number;
  maxIterations: number;
  maxSubAgents: number;
  cooldownMs: number;
  tools: ToolSet;
  activeTools: string[] | undefined;
  systemPrompt: string;
  modelId: AiModel;
  error: Error | null;
  shouldContinue: boolean;
  lastUsage: LLMUsage | null;
  lastFinishReason: FinishReason | null;
  pendingSpawnRequests: PendingSpawnRequest[];
  subAgentResults: SubAgentResult[];
  metrics: MetricsCollector;
  orchestratorRefs: Map<string, AnyActorRef>;
};

export type AgentInput = {
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
  tools: ToolSet;
  systemPrompt: string;
  modelId?: AiModel;
  maxIterations?: number;
  maxSubAgents?: number;
  cooldownMs?: number;
  activeTools?: string[];
  agentId?: string;
  isSubAgent?: boolean;
  parentAgentId?: string;
  task?: string;
};

export type AgentEvent =
  | { type: "agent.start" }
  | { type: "agent.cancel" }
  | { type: "agent.error"; error: Error };
