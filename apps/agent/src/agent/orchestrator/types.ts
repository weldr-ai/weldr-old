import type { ToolSet } from "ai";
import type { ActorRefFrom } from "xstate";

import type { AiModel } from "@weldr/db/schema";

import type { AgentMachine } from "@/agent/machine";
import type { SubAgentResult } from "@/core/events/types";
import type { BranchWithSnapshot, ProjectWithConfig, User } from "@/core/types";

export type { SubAgentResult };

export type SubAgentTask = {
  id: string;
  task: string;
  context?: string;
  depends: string[];
};

export type SubAgentStatus = "waiting" | "running" | "completed" | "failed";

export type SubAgentState = {
  id: string;
  task: string;
  context?: string;
  depends: string[];
  status: SubAgentStatus;
  retryCount: number;
  result?: string;
  error?: string;
  actorRef?: ActorRefFrom<AgentMachine>;
};

export type OrchestratorContext = {
  toolCallId: string;
  agents: SubAgentState[];
  maxRetries: number;
  project: ProjectWithConfig;
  branch: BranchWithSnapshot;
  user: User;
  tools: ToolSet;
  modelId: AiModel;
  cooldownMs: number;
  validationError?: string;
};

export type OrchestratorInput = {
  toolCallId: string;
  agents: SubAgentTask[];
  maxRetries?: number;
  project: ProjectWithConfig;
  branch: BranchWithSnapshot;
  user: User;
  tools: ToolSet;
  modelId: AiModel;
  cooldownMs: number;
};

export type OrchestratorEvents =
  | { type: "_subagent.completed"; agentId: string; result: string }
  | { type: "_subagent.failed"; agentId: string; error: string };

export type OrchestratorEmittedEvent =
  | { type: "orchestrator.started"; toolCallId: string; agentCount: number }
  | { type: "orchestrator.validation.failed"; toolCallId: string; error: string }
  | {
      type: "orchestrator.agent.started";
      toolCallId: string;
      agentId: string;
      task: string;
      depends: string[];
    }
  | {
      type: "orchestrator.agent.completed";
      toolCallId: string;
      agentId: string;
      result: string;
    }
  | {
      type: "orchestrator.agent.failed";
      toolCallId: string;
      agentId: string;
      error: string;
      reason: "execution_failed" | "dependency_failed" | "max_retries_exceeded";
    }
  | {
      type: "orchestrator.agent.retrying";
      toolCallId: string;
      agentId: string;
      attempt: number;
      maxRetries: number;
    }
  | {
      type: "orchestrator.completed";
      toolCallId: string;
      results: SubAgentResult[];
    }
  | {
      type: "orchestrator.failed";
      toolCallId: string;
      error: string;
    };
