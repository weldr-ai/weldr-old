import type { ToolSet } from "ai";
import type { AnyActorRef } from "xstate";

import type { branches, projects, versions } from "@weldr/db/schema";
import type { UserMessage } from "@weldr/shared/types";

import type { User } from "@/lib/auth";

export type AgentResult = {
  success: boolean;
  changedFiles?: Array<{ path: string; type: "added" | "modified" | "deleted" }>;
};

export type ProjectWithConfig = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

export type BranchWithVersion = typeof branches.$inferSelect & {
  headVersion: typeof versions.$inferSelect;
};

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

export type SessionMachineInput = {
  project: ProjectWithConfig;
  branch: BranchWithVersion;
  user: User;
};

export type SessionMachineEvents =
  | { type: "START"; message?: UserMessage }
  | { type: "AGENT_COMPLETE"; result: AgentResult }
  | { type: "AGENT_ERROR"; error: Error }
  | { type: "CANCEL" }
  | { type: "FINALIZE_COMPLETE" };
