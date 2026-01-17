import { nanoid } from "@weldr/shared/nanoid";

import type { User } from "@/core/auth";
import type { BranchWithSnapshot, ProjectWithConfig } from "@/core/types";

export type { User };

// =============================================================================
// Core Types
// =============================================================================

/**
 * Project with integration categories.
 */
export type Project = ProjectWithConfig;

/**
 * Branch with snapshot.
 */
export type Branch = BranchWithSnapshot;

// =============================================================================
// Session Context
// =============================================================================

/**
 * The session context - a simple immutable object.
 * Contains all the data needed for a session to execute.
 */
export type SessionContext = {
  chatId?: string;
  project: Project;
  branch: Branch;
  user: User;
  // Task execution state
  currentTaskId?: string;
  activeTasks?: string[];
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a new session context.
 */
export function createSessionContext(params: {
  project: Project;
  branch: Branch;
  user: User;
}): SessionContext {
  return {
    project: params.project,
    branch: params.branch,
    user: params.user,
  };
}

/**
 * Updates context immutably.
 */
export function updateSessionContext(
  context: SessionContext,
  updates: Partial<SessionContext>,
): SessionContext {
  return { ...context, ...updates };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Default maximum iterations for agent execution.
 */
const DEFAULT_MAX_ITERATIONS = 50;

/**
 * Input parameters for creating an agent machine.
 */
export type AgentMachineInput = {
  project: Project;
  branch: Branch;
  user: User;
  maxIterations?: number;
};

/**
 * Creates input for initializing a session machine.
 */
export function createSessionInput(params: {
  chatId: string;
  project: Project;
  branch: Branch;
  user: User;
}): {
  chatId: string;
  traceId: string;
  project: Project;
  branch: Branch;
  user: User;
} {
  return {
    chatId: params.chatId,
    traceId: nanoid(),
    project: params.project,
    branch: params.branch,
    user: params.user,
  };
}

/**
 * Creates input for initializing an agent machine.
 */
export function createAgentInput(params: AgentMachineInput): {
  maxIterations: number;
} {
  return {
    maxIterations: params.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  };
}
