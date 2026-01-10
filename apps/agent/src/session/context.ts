import type { branches, projects, versions } from "@weldr/db/schema";

import type { User } from "@/lib/auth";

export type { User };

// =============================================================================
// Core Types
// =============================================================================

/**
 * Project with integration categories.
 */
export type Project = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

/**
 * Branch with head version.
 */
export type Branch = typeof branches.$inferSelect & {
  headVersion: typeof versions.$inferSelect;
};

// =============================================================================
// Session Context
// =============================================================================

/**
 * The session context - a simple immutable object.
 * Contains all the data needed for a session to execute.
 */
export type SessionContext = {
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
// Legacy Helper Functions (for backward compatibility)
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
export function createSessionInput(params: { project: Project; branch: Branch; user: User }): {
  project: Project;
  branch: Branch;
  user: User;
} {
  return {
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
