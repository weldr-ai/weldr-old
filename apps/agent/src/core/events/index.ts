export { createEventForwarder, forwardEventToSSE } from "./forwarder";

// Re-export persistence types commonly used with events
export type { AwaitingUserKind, PendingSpawnRequest, SessionState } from "@/core/persistence";

export type {
  // Base types
  BaseEvent,
  ErrorInfo,
  EventHandler,
  FinishReason,
  LLMUsage,
  SessionMetrics,
  AgentMetrics,
  WeldrEvent,

  // Content types
  AssistantContentPart,
  TextContentPart,
  ReasoningContentPart,
  ToolCallContentPart,
  ToolResultContentPart,

  // Sub-agent types
  SubAgentResult,
  SubAgentTask,

  // Session lifecycle events
  SessionLifecycleEvent,
  SessionStartedEvent,
  SessionStateEnteredEvent,
  SessionAwaitingUserEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
  SessionCancelledEvent,
  SessionPausedEvent,
  SessionResumedEvent,

  // LLM stream events
  LLMStreamEvent,
  LLMStartedEvent,
  LLMDeltaTextEvent,
  LLMDeltaReasoningEvent,
  LLMToolCallEvent,
  LLMToolResultEvent,
  LLMCompletedEvent,
  LLMCancelledEvent,
  LLMErrorEvent,

  // Tool events
  ToolEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
  ToolFailedEvent,

  // Orchestrator events
  OrchestratorEvent,
  OrchestratorStartedEvent,
  OrchestratorAgentStartedEvent,
  OrchestratorAgentCompletedEvent,
  OrchestratorAgentFailedEvent,
  OrchestratorAgentRetryingEvent,
  OrchestratorCompletedEvent,
  OrchestratorFailedEvent,

  // Iteration events
  IterationEvent,
  IterationStartedEvent,
  IterationCompletedEvent,

  // All public events
  PublicSessionEvent,

  // Internal events - user input
  InternalUserEvent,
  InternalUserMessageEvent,
  InternalUserConfirmationEvent,
  InternalUserSelectionEvent,

  // Internal events - control
  InternalControlEvent,
  InternalControlCancelEvent,
  InternalControlPauseEvent,
  InternalControlResumeEvent,

  // Internal events - LLM
  InternalLLMEvent,
  InternalLLMCompletedEvent,
  InternalLLMCancelledEvent,
  InternalLLMErrorEvent,

  // LLM actor commands
  LLMActorCommand,
  LLMCancelCommand,

  // Internal events - orchestrator
  InternalOrchestratorEvent,
  InternalOrchestratorCompletedEvent,
  InternalOrchestratorFailedEvent,

  // Internal events - sub-agent
  InternalSubAgentEvent,
  InternalSubAgentResultEvent,
  InternalSubAgentErrorEvent,

  // Internal events - iteration
  InternalIterationEvent,
  InternalIterationNextEvent,
  InternalIterationStopEvent,

  // All internal events
  InternalSessionEvent,

  // Combined event types
  SessionMachineEvent,

  // Agent machine events
  AgentEmittedEvent,
  AgentStartedEvent,
  AgentIterationStartedEvent,
  AgentIterationCompletedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentCancelledEvent,
} from "./types";
