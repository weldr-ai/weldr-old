/**
 * Session Machine Types
 *
 * Type definitions for the unified session machine that handles
 * the complete conversation flow including LLM streaming, tool execution,
 * and sub-agent orchestration.
 */

import type { ModelMessage, ToolSet, UserContent } from "ai";
import type { AnyActorRef } from "xstate";

import type { AiModel } from "@weldr/db/schema";

import type {
  AssistantContentPart,
  AwaitingUserKind,
  FinishReason,
  LLMUsage,
  PendingSpawnRequest,
  SessionState,
  SubAgentResult,
} from "@/core/events";
import type { MetricsCollector } from "@/core/metrics";
import type { SessionSnapshot } from "@/core/persistence";
import type { BranchWithVersion, ProjectWithConfig, User } from "@/core/types";

// =============================================================================
// Configuration Types
// =============================================================================

export type AgentConfig = {
  modelId?: AiModel;
  maxIterations?: number;
  maxSubAgents?: number;
  cooldownMs?: number;
  activeTools?: string[];
};

// =============================================================================
// Session Machine Input
// =============================================================================

export type SessionMachineInput = {
  versionId: string;
  traceId: string;
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
  agentConfig?: AgentConfig;
  restoredSnapshot?: SessionSnapshot | null;
};

// =============================================================================
// Session Machine Context
// =============================================================================

export type SessionMachineContext = {
  // Identity
  versionId: string;
  traceId: string;

  // Domain objects
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;

  // Session state
  sessionState: SessionState;
  awaitingUserKind: AwaitingUserKind | null;

  // Agent execution state
  tools: ToolSet;
  systemPrompt: string;
  modelId: AiModel;
  maxIterations: number;
  maxSubAgents: number;
  cooldownMs: number;
  activeTools: string[] | undefined;

  // LLM state
  messages: ModelMessage[];
  assistantContent: AssistantContentPart[];
  currentMessageId: string;
  iterationCount: number;
  iterationStartedAt: number | null;
  lastUsage: LLMUsage | null;
  lastFinishReason: FinishReason | null;

  // Sub-agent state
  pendingSpawnRequests: PendingSpawnRequest[];
  subAgentResults: SubAgentResult[];
  orchestratorRefs: Map<string, AnyActorRef>;

  // Error state
  error: Error | null;

  // Metrics
  metrics: MetricsCollector;
  startedAt: number;
  initializingStartedAt: number | null;
  finalizingStartedAt: number | null;

  // Pause state
  pausedAt: number | null;
  pauseReason: string | null;
};

// =============================================================================
// Session Machine Events (Internal)
// =============================================================================

export type SessionMachineEvents =
  // User input events
  | { type: "_user.message"; content: UserContent; attachmentIds?: string[] }
  | { type: "_user.confirmation"; value: boolean }
  | { type: "_user.selection"; value: string }

  // Control events
  | { type: "_control.cancel"; reason?: string }
  | { type: "_control.pause"; reason?: string }
  | { type: "_control.resume" }

  // LLM actor responses
  | {
      type: "_llm.completed";
      messageId: string;
      content: AssistantContentPart[];
      usage: LLMUsage;
      finishReason: FinishReason;
      pendingSpawnRequests: PendingSpawnRequest[];
      durationMs: number;
    }
  | { type: "_llm.cancelled"; messageId: string }
  | { type: "_llm.error"; error: Error }

  // Orchestrator events
  | { type: "_orchestrator.completed"; toolCallId: string; results: SubAgentResult[] }
  | { type: "_orchestrator.failed"; toolCallId: string; error: string }

  // Internal control flow
  | { type: "START" }
  | { type: "INITIALIZED"; tools: ToolSet; systemPrompt: string }
  | { type: "MESSAGES_LOADED"; messages: ModelMessage[] }
  | { type: "MESSAGES_SAVED" }
  | { type: "FINALIZED"; commitHash: string | null }
  | { type: "ACTOR_ERROR"; error: Error };

// =============================================================================
// Exported Types
// =============================================================================

export type { User } from "@/core/auth";
export type { ProjectWithConfig as Project, BranchWithVersion as Branch } from "@/core/types";
