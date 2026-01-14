/**
 * Event System for the Weldr Agent
 *
 * Defines a two-layer event architecture:
 *
 * **Public Events** (emitted via `actor.on('*')` and forwarded to SSE):
 * - Semantic, user-facing events that describe what's happening in the session
 * - Session lifecycle: started, state changes, awaiting user, completed, failed
 * - LLM streaming: started, deltas, tool calls, completed, cancelled
 * - Tool execution: started, completed, failed
 * - Orchestrator/sub-agents: started, agent events, completed
 * - Iteration tracking: started, completed
 *
 * **Internal Events** (machine-only, prefixed with `_`):
 * - Low-level events used for state machine coordination
 * - User input: _user.message, _user.confirmation, _user.selection
 * - Control: _control.cancel, _control.pause
 * - LLM: _llm.completed, _llm.cancelled, _llm.error
 * - Orchestrator: _orchestrator.completed, _orchestrator.failed
 * - Sub-agent: _subagent.result, _subagent.error
 * - Iteration: _iteration.next, _iteration.stop
 *
 * @module core/events/types
 */

import type { UserContent } from "ai";

import type { SessionState } from "@/core/persistence";

// ============================================================================
// Base Types
// ============================================================================

export type BaseEvent = {
  timestamp: number;
  versionId: string;
  traceId: string;
};

export type ErrorInfo = {
  message: string;
  code?: string;
  stack?: string;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
};

export type FinishReason =
  | "length"
  | "stop"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

// ============================================================================
// Session Metrics
// ============================================================================

export type SessionMetrics = {
  totalDurationMs: number;
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
};

// Import AgentMetrics from metrics module for use in this file
import type { AgentMetrics, ToolMetricEntry, ToolMetrics } from "@/core/metrics/types";

// Re-export AgentMetrics for external consumers
export type { AgentMetrics, ToolMetricEntry, ToolMetrics };

// ============================================================================
// Sub-Agent Types
// ============================================================================

export type SubAgentResult = {
  id: string;
  task: string;
  success: boolean;
  result: string;
};

export type SubAgentTask = {
  id: string;
  task: string;
  context?: string;
  depends?: string[];
};

export type PendingSpawnRequest = {
  toolCallId: string;
  agents: SubAgentTask[];
};

// ============================================================================
// Public Events - Session Lifecycle
// ============================================================================

export type SessionStartedEvent = {
  type: "session.started";
  versionId: string;
  traceId: string;
};

export type SessionStateEnteredEvent = {
  type: "session.state.entered";
  state: SessionState;
  previousState?: SessionState;
};

export type SessionAwaitingUserEvent = {
  type: "session.awaiting_user";
  kind: "message" | "confirmation" | "selection";
  prompt?: string;
};

export type SessionCompletedEvent = {
  type: "session.completed";
  metrics: SessionMetrics;
};

export type SessionFailedEvent = {
  type: "session.failed";
  error: ErrorInfo;
  metrics: SessionMetrics;
};

export type SessionCancelledEvent = {
  type: "session.cancelled";
  reason?: string;
};

export type SessionPausedEvent = {
  type: "session.paused";
  reason: string;
};

export type SessionResumedEvent = {
  type: "session.resumed";
};

export type SessionLifecycleEvent =
  | SessionStartedEvent
  | SessionStateEnteredEvent
  | SessionAwaitingUserEvent
  | SessionCompletedEvent
  | SessionFailedEvent
  | SessionCancelledEvent
  | SessionPausedEvent
  | SessionResumedEvent;

// ============================================================================
// Public Events - LLM Streaming
// ============================================================================

export type LLMStartedEvent = {
  type: "llm.started";
  messageId: string;
  modelId: string;
};

export type LLMDeltaTextEvent = {
  type: "llm.delta.text";
  messageId: string;
  text: string;
};

export type LLMDeltaReasoningEvent = {
  type: "llm.delta.reasoning";
  messageId: string;
  text: string;
};

export type LLMToolCallEvent = {
  type: "llm.tool_call";
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
};

export type LLMToolResultEvent = {
  type: "llm.tool_result";
  messageId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
};

export type LLMCompletedEvent = {
  type: "llm.completed";
  messageId: string;
  usage: LLMUsage;
  finishReason: FinishReason;
};

export type LLMCancelledEvent = {
  type: "llm.cancelled";
  messageId: string;
  reason: string;
};

export type LLMErrorEvent = {
  type: "llm.error";
  messageId: string;
  error: ErrorInfo;
};

export type LLMStreamEvent =
  | LLMStartedEvent
  | LLMDeltaTextEvent
  | LLMDeltaReasoningEvent
  | LLMToolCallEvent
  | LLMToolResultEvent
  | LLMCompletedEvent
  | LLMCancelledEvent
  | LLMErrorEvent;

// ============================================================================
// Public Events - Tool Execution
// ============================================================================

export type ToolStartedEvent = {
  type: "tool.started";
  toolCallId: string;
  toolName: string;
};

export type ToolCompletedEvent = {
  type: "tool.completed";
  toolCallId: string;
  toolName: string;
  success: boolean;
  durationMs: number;
};

export type ToolFailedEvent = {
  type: "tool.failed";
  toolCallId: string;
  toolName: string;
  error: ErrorInfo;
};

export type ToolEvent = ToolStartedEvent | ToolCompletedEvent | ToolFailedEvent;

// ============================================================================
// Public Events - Orchestrator / Sub-Agents
// ============================================================================

export type OrchestratorStartedEvent = {
  type: "orchestrator.started";
  toolCallId: string;
  agentCount: number;
};

export type OrchestratorAgentStartedEvent = {
  type: "orchestrator.agent.started";
  toolCallId: string;
  agentId: string;
  task: string;
  depends?: string[];
};

export type OrchestratorAgentCompletedEvent = {
  type: "orchestrator.agent.completed";
  toolCallId: string;
  agentId: string;
  result: string;
};

export type OrchestratorAgentFailedEvent = {
  type: "orchestrator.agent.failed";
  toolCallId: string;
  agentId: string;
  error: string;
  reason: "execution_failed" | "dependency_failed" | "max_retries_exceeded";
};

export type OrchestratorAgentRetryingEvent = {
  type: "orchestrator.agent.retrying";
  toolCallId: string;
  agentId: string;
  attempt: number;
  maxRetries: number;
};

export type OrchestratorCompletedEvent = {
  type: "orchestrator.completed";
  toolCallId: string;
  results: SubAgentResult[];
};

export type OrchestratorFailedEvent = {
  type: "orchestrator.failed";
  toolCallId: string;
  error: string;
};

export type OrchestratorEvent =
  | OrchestratorStartedEvent
  | OrchestratorAgentStartedEvent
  | OrchestratorAgentCompletedEvent
  | OrchestratorAgentFailedEvent
  | OrchestratorAgentRetryingEvent
  | OrchestratorCompletedEvent
  | OrchestratorFailedEvent;

// ============================================================================
// Public Events - Iteration Tracking
// ============================================================================

export type IterationStartedEvent = {
  type: "iteration.started";
  iteration: number;
};

export type IterationCompletedEvent = {
  type: "iteration.completed";
  iteration: number;
  usage: LLMUsage;
  durationMs: number;
};

export type IterationEvent = IterationStartedEvent | IterationCompletedEvent;

// ============================================================================
// All Public Events
// ============================================================================

export type PublicSessionEvent =
  | SessionLifecycleEvent
  | LLMStreamEvent
  | ToolEvent
  | OrchestratorEvent
  | IterationEvent;

// ============================================================================
// Internal Events - User Input
// ============================================================================

export type InternalUserMessageEvent = {
  type: "_user.message";
  content: UserContent;
  attachmentIds?: string[];
};

export type InternalUserConfirmationEvent = {
  type: "_user.confirmation";
  value: boolean;
};

export type InternalUserSelectionEvent = {
  type: "_user.selection";
  value: string;
};

export type InternalUserEvent =
  | InternalUserMessageEvent
  | InternalUserConfirmationEvent
  | InternalUserSelectionEvent;

// ============================================================================
// Internal Events - Control
// ============================================================================

export type InternalControlCancelEvent = {
  type: "_control.cancel";
  reason?: string;
};

export type InternalControlPauseEvent = {
  type: "_control.pause";
  reason?: string;
};

export type InternalControlResumeEvent = {
  type: "_control.resume";
};

export type InternalControlEvent =
  | InternalControlCancelEvent
  | InternalControlPauseEvent
  | InternalControlResumeEvent;

// ============================================================================
// Internal Events - LLM Actor
// ============================================================================

export type InternalLLMCompletedEvent = {
  type: "_llm.completed";
  messageId: string;
  content: AssistantContentPart[];
  usage: LLMUsage;
  finishReason: FinishReason;
  pendingSpawnRequests: PendingSpawnRequest[];
  durationMs: number;
};

export type InternalLLMCancelledEvent = {
  type: "_llm.cancelled";
  messageId: string;
};

export type InternalLLMErrorEvent = {
  type: "_llm.error";
  error: Error;
};

export type InternalLLMEvent =
  | InternalLLMCompletedEvent
  | InternalLLMCancelledEvent
  | InternalLLMErrorEvent;

// ============================================================================
// Internal Events - LLM Actor Control (sent TO the LLM actor)
// ============================================================================

export type LLMCancelCommand = {
  type: "llm.cancel";
  reason?: string;
};

export type LLMActorCommand = LLMCancelCommand;

// ============================================================================
// Internal Events - Orchestrator
// ============================================================================

export type InternalOrchestratorCompletedEvent = {
  type: "_orchestrator.completed";
  toolCallId: string;
  results: SubAgentResult[];
};

export type InternalOrchestratorFailedEvent = {
  type: "_orchestrator.failed";
  toolCallId: string;
  error: string;
};

export type InternalOrchestratorEvent =
  | InternalOrchestratorCompletedEvent
  | InternalOrchestratorFailedEvent;

// ============================================================================
// Internal Events - Sub-Agent
// ============================================================================

export type InternalSubAgentResultEvent = {
  type: "_subagent.result";
  agentId: string;
  result: string;
  metrics: AgentMetrics;
};

export type InternalSubAgentErrorEvent = {
  type: "_subagent.error";
  agentId: string;
  error: string;
};

export type InternalSubAgentEvent = InternalSubAgentResultEvent | InternalSubAgentErrorEvent;

// ============================================================================
// Internal Events - Iteration Control
// ============================================================================

export type InternalIterationNextEvent = {
  type: "_iteration.next";
};

export type InternalIterationStopEvent = {
  type: "_iteration.stop";
  reason: string;
};

export type InternalIterationEvent = InternalIterationNextEvent | InternalIterationStopEvent;

// ============================================================================
// All Internal Events
// ============================================================================

export type InternalSessionEvent =
  | InternalUserEvent
  | InternalControlEvent
  | InternalLLMEvent
  | InternalOrchestratorEvent
  | InternalSubAgentEvent
  | InternalIterationEvent;

// ============================================================================
// Combined Event Types
// ============================================================================

export type SessionMachineEvent = PublicSessionEvent | InternalSessionEvent;

export type WeldrEvent = BaseEvent & PublicSessionEvent;

export type EventHandler = (event: WeldrEvent) => void;

// ============================================================================
// Agent Machine Emitted Events (for sub-agents / orchestrator)
// ============================================================================

export type AgentStartedEvent = {
  type: "agent.started";
  agentId: string;
  modelId: string;
  isSubAgent: boolean;
  task?: string;
};

export type AgentIterationStartedEvent = {
  type: "agent.iteration.started";
  agentId: string;
  iteration: number;
};

export type AgentIterationCompletedEvent = {
  type: "agent.iteration.completed";
  agentId: string;
  iteration: number;
  usage: LLMUsage;
  finishReason: FinishReason | string;
  durationMs: number;
};

export type AgentCompletedEvent = {
  type: "agent.completed";
  agentId: string;
  metrics: AgentMetrics;
};

export type AgentFailedEvent = {
  type: "agent.failed";
  agentId: string;
  error: ErrorInfo;
  metrics: AgentMetrics;
};

export type AgentCancelledEvent = {
  type: "agent.cancelled";
  agentId: string;
};

export type AgentEmittedEvent =
  | AgentStartedEvent
  | AgentIterationStartedEvent
  | AgentIterationCompletedEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | AgentCancelledEvent;

// ============================================================================
// Assistant Content Types
// ============================================================================

export type TextContentPart = {
  type: "text";
  text: string;
};

export type ReasoningContentPart = {
  type: "reasoning";
  text: string;
};

export type ToolCallContentPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
};

export type ToolResultContentPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
};

export type AssistantContentPart =
  | TextContentPart
  | ReasoningContentPart
  | ToolCallContentPart
  | ToolResultContentPart;
