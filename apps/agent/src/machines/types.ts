import type { ToolSet } from "ai";
import type { AnyActorRef } from "xstate";

import type { branches, projects, versions } from "@weldr/db/schema";
import type { UserMessage } from "@weldr/shared/types";

import type { User } from "@/lib/auth";

export type ProjectWithConfig = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

export type BranchWithVersion = typeof branches.$inferSelect & {
  headVersion: typeof versions.$inferSelect;
};

export type SessionMachineInput = {
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
};

export type SessionMachineEvents =
  | { type: "START"; message?: UserMessage }
  | { type: "AGENT_COMPLETE" }
  | { type: "AGENT_ERROR"; error: Error }
  | { type: "CANCEL" };

/**
 * Base session machine context used by session actors.
 * The agentRef uses AnyActorRef to avoid circular dependencies between
 * the types file and the agent machine.
 *
 * For properly typed agent reference access, use the session machine's
 * snapshot context directly or the TypedSessionMachineContext from session.ts.
 */
export type SessionMachineContext = {
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
  message: UserMessage | null;
  error: Error | null;
  agentRef: AnyActorRef | null;
  tools: ToolSet;
  systemPrompt: string;
};
