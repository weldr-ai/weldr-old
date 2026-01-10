import type { ActorRefFrom } from "xstate";
import type { z } from "zod";

import type { branches, projects, tasks, versions } from "@weldr/db/schema";
import type { Task } from "@weldr/shared/types";

// =============================================================================
// Database Entity Types
// =============================================================================

/**
 * Project with runtime configuration.
 * Extends the database project type with integration categories.
 */
export type Project = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

/**
 * Branch with head version reference.
 * Represents the current branch state with its latest version.
 */
export type Branch = typeof branches.$inferSelect & {
  headVersion: Version;
};

/**
 * Version from the database.
 */
export type Version = typeof versions.$inferSelect;

/**
 * User information for session context.
 */
export type User = {
  id: string;
  name: string;
  email: string;
};

/**
 * Task from the database with its data.
 */
export type TaskRecord = typeof tasks.$inferSelect;

/**
 * Task data structure used in planning.
 */
export type TaskData = Task;

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool definition structure.
 */
export type ToolDefinition<
  TName extends string = string,
  TInput extends z.ZodSchema = z.ZodSchema,
  TOutput extends z.ZodSchema = z.ZodSchema,
> = {
  name: TName;
  description: string;
  whenToUse: string;
  inputSchema: TInput;
  outputSchema: TOutput;
};

/**
 * Result of a tool execution.
 */
export type ToolResult<T = unknown> = {
  toolCallId: string;
  toolName: string;
  result: T;
};

/**
 * Tool call request from the LLM.
 */
export type ToolCall<T = unknown> = {
  id: string;
  name: string;
  input: T;
};

// =============================================================================
// LLM Response Types
// =============================================================================

/**
 * Text content from the LLM.
 */
export type TextContent = {
  type: "text";
  text: string;
};

/**
 * Reasoning content from the LLM.
 */
export type ReasoningContent = {
  type: "reasoning";
  text: string;
};

/**
 * Tool call content from the LLM.
 */
export type ToolCallContent = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
};

/**
 * Tool result content for the LLM.
 */
export type ToolResultContent = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
};

/**
 * Message content union type.
 */
export type MessageContent = TextContent | ReasoningContent | ToolCallContent | ToolResultContent;

/**
 * Message roles in the conversation.
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Core message structure for LLM communication.
 */
export type CoreMessage = {
  id: string;
  role: MessageRole;
  content: string | MessageContent[];
  createdAt?: Date;
};

// =============================================================================
// Session Machine Types
// =============================================================================

/**
 * Session machine context.
 * Holds the overall session state including project, branch, and user info.
 */
export type SessionContext = {
  project: Project;
  branch: Branch;
  user: User;
  error: Error | null;
  agentRef: ActorRefFrom<AgentMachine> | null;
};

/**
 * Session machine events.
 */
export type SessionStartEvent = {
  type: "START";
  project: Project;
  branch: Branch;
  user: User;
};

export type SessionAgentCompleteEvent = {
  type: "AGENT_COMPLETE";
};

export type SessionAgentErrorEvent = {
  type: "AGENT_ERROR";
  error: Error;
};

export type SessionCancelEvent = {
  type: "CANCEL";
};

export type SessionFinalizeCompleteEvent = {
  type: "FINALIZE_COMPLETE";
};

export type SessionEvent =
  | SessionStartEvent
  | SessionAgentCompleteEvent
  | SessionAgentErrorEvent
  | SessionCancelEvent
  | SessionFinalizeCompleteEvent;

// =============================================================================
// Agent Machine Types
// =============================================================================

/**
 * Agent machine context.
 * Manages the agent's conversation state, task execution, and tool results.
 *
 * Note: Sub-agent spawning is controlled via AI SDK's activeTools feature,
 * not via a context flag. Simply don't include spawn_agent tool for sub-agents.
 */
export type AgentContext = {
  messages: CoreMessage[];
  currentTask: TaskData | null;
  toolResults: ToolResult[];
  iterationCount: number;
  maxIterations: number;
  error: Error | null;
};

/**
 * Agent machine events.
 */
export type AgentProcessEvent = {
  type: "PROCESS";
  task: TaskData;
};

export type AgentToolCallEvent = {
  type: "TOOL_CALL";
  toolCall: ToolCall;
};

export type AgentToolResultEvent = {
  type: "TOOL_RESULT";
  result: ToolResult;
};

export type AgentToolErrorEvent = {
  type: "TOOL_ERROR";
  toolCallId: string;
  toolName: string;
  error: Error;
};

export type AgentStreamTextEvent = {
  type: "STREAM_TEXT";
  text: string;
  messageId: string;
};

export type AgentStreamReasoningEvent = {
  type: "STREAM_REASONING";
  text: string;
  messageId: string;
};

export type AgentCompleteEvent = {
  type: "COMPLETE";
};

export type AgentCancelEvent = {
  type: "CANCEL";
};

export type AgentEvent =
  | AgentProcessEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentToolErrorEvent
  | AgentStreamTextEvent
  | AgentStreamReasoningEvent
  | AgentCompleteEvent
  | AgentCancelEvent;

// =============================================================================
// Tool Machine Types
// =============================================================================

/**
 * Tool machine context.
 * Manages individual tool execution state.
 */
export type ToolContext<TInput = unknown, TOutput = unknown> = {
  toolName: string;
  toolCallId: string;
  input: TInput;
  output: TOutput | null;
  error: Error | null;
};

/**
 * Tool machine events.
 */
export type ToolExecuteEvent<TInput = unknown> = {
  type: "EXECUTE";
  toolName: string;
  toolCallId: string;
  input: TInput;
};

export type ToolCompleteEvent<TOutput = unknown> = {
  type: "COMPLETE";
  output: TOutput;
};

export type ToolErrorEvent = {
  type: "ERROR";
  error: Error;
};

export type ToolEvent<TInput = unknown, TOutput = unknown> =
  | ToolExecuteEvent<TInput>
  | ToolCompleteEvent<TOutput>
  | ToolErrorEvent;

// =============================================================================
// Machine Type Definitions (for ActorRefFrom usage)
// =============================================================================

/**
 * Placeholder type for the Agent machine.
 * Used for typing ActorRefFrom in SessionContext.
 */
export type AgentMachine = {
  context: AgentContext;
  events: AgentEvent;
};

/**
 * Placeholder type for the Session machine.
 */
export type SessionMachine = {
  context: SessionContext;
  events: SessionEvent;
};

/**
 * Placeholder type for the Tool machine.
 */
export type ToolMachine<TInput = unknown, TOutput = unknown> = {
  context: ToolContext<TInput, TOutput>;
  events: ToolEvent<TInput, TOutput>;
};

// =============================================================================
// Input Types for Machine Creation
// =============================================================================

/**
 * Input for creating a new session machine.
 */
export type SessionMachineInput = {
  project: Project;
  branch: Branch;
  user: User;
};

/**
 * Input for creating a new agent machine.
 */
export type AgentMachineInput = {
  task: TaskData;
  maxIterations?: number;
  initialMessages?: CoreMessage[];
};

/**
 * Input for creating a new tool machine.
 */
export type ToolMachineInput<TInput = unknown> = {
  toolName: string;
  toolCallId: string;
  input: TInput;
};

// =============================================================================
// Output Types for Machine Results
// =============================================================================

/**
 * Output from a completed session.
 */
export type SessionOutput = {
  success: boolean;
  error?: Error;
};

/**
 * Output from a completed agent run.
 */
export type AgentOutput = {
  success: boolean;
  messages: CoreMessage[];
  toolResults: ToolResult[];
  error?: Error;
};

/**
 * Output from a completed tool execution.
 */
export type ToolOutput<T = unknown> = {
  success: boolean;
  result?: T;
  error?: Error;
};
