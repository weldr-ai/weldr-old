import { assign, emit, sendParent, setup, stopChild, type AnyActorLogic } from "xstate";

import type {
  OrchestratorContext,
  OrchestratorEmittedEvent,
  OrchestratorEvents,
  OrchestratorInput,
  SubAgentResult,
  SubAgentState,
} from "./types";
import {
  areAllAgentsResolved,
  canRetryAgent,
  getDependentAgents,
  getReadyAgents,
  validateDependencyGraph,
} from "./utils";

const DEFAULT_MAX_RETRIES = 3;

type CreateOrchestratorMachineOptions = {
  agentMachine: AnyActorLogic;
};

export function createSubAgentOrchestratorMachine({
  agentMachine,
}: CreateOrchestratorMachineOptions) {
  return setup({
    types: {
      context: {} as OrchestratorContext,
      events: {} as OrchestratorEvents,
      input: {} as OrchestratorInput,
      emitted: {} as OrchestratorEmittedEvent,
    },
    actors: {
      agentMachine,
    },
    guards: {
      isValidGraph: ({ context }) => context.validationError === undefined,
      hasReadyAgents: ({ context }) => getReadyAgents(context).length > 0,
      allAgentsResolved: ({ context }) => areAllAgentsResolved(context),
      canRetry: ({ context, event }) => {
        if (event.type !== "SUB_AGENT_FAILED") {
          return false;
        }
        return canRetryAgent(context, event.agentId);
      },
    },
    actions: {
      validateGraph: assign({
        validationError: ({ context }) => validateDependencyGraph(context.agents),
      }),

      emitOrchestratorStarted: emit(({ context }) => ({
        type: "orchestrator.started" as const,
        toolCallId: context.toolCallId,
        agentCount: context.agents.length,
      })),

      emitValidationFailed: emit(({ context }) => ({
        type: "orchestrator.validation.failed" as const,
        toolCallId: context.toolCallId,
        error: context.validationError ?? "Unknown validation error",
      })),

      emitAgentStarted: emit((_, params: { agent: SubAgentState }) => ({
        type: "orchestrator.agent.started" as const,
        toolCallId: "",
        agentId: params.agent.id,
        task: params.agent.task,
        depends: params.agent.depends,
      })),

      emitAgentCompleted: emit(({ context }, params: { agentId: string; result: string }) => ({
        type: "orchestrator.agent.completed" as const,
        toolCallId: context.toolCallId,
        agentId: params.agentId,
        result: params.result,
      })),

      emitAgentFailed: emit(
        (
          { context },
          params: {
            agentId: string;
            error: string;
            reason: "execution_failed" | "dependency_failed" | "max_retries_exceeded";
          },
        ) => ({
          type: "orchestrator.agent.failed" as const,
          toolCallId: context.toolCallId,
          agentId: params.agentId,
          error: params.error,
          reason: params.reason,
        }),
      ),

      emitAgentRetrying: emit(
        ({ context }, params: { agentId: string; attempt: number; maxRetries: number }) => ({
          type: "orchestrator.agent.retrying" as const,
          toolCallId: context.toolCallId,
          agentId: params.agentId,
          attempt: params.attempt,
          maxRetries: params.maxRetries,
        }),
      ),

      emitOrchestratorCompleted: emit(({ context }) => ({
        type: "orchestrator.completed" as const,
        toolCallId: context.toolCallId,
        results: context.agents.map(
          (a): SubAgentResult => ({
            id: a.id,
            task: a.task,
            success: a.status === "completed",
            result: a.result ?? a.error ?? "No result",
          }),
        ),
      })),

      emitOrchestratorFailed: emit(({ context }) => ({
        type: "orchestrator.failed" as const,
        toolCallId: context.toolCallId,
        error: context.validationError ?? "Orchestration failed",
      })),

      spawnReadyAgents: assign({
        agents: ({ context, spawn, self }) => {
          const ready = getReadyAgents(context);

          return context.agents.map((agent) => {
            const readyAgent = ready.find((r) => r.id === agent.id);
            if (!readyAgent) {
              return agent;
            }

            const subAgentSystemPrompt = `You are a sub-agent with a specific task.

TASK: ${agent.task}
${agent.context ? `\nCONTEXT: ${agent.context}` : ""}

RULES:
1. Focus ONLY on the assigned task
2. You CANNOT spawn other agents
3. Be efficient - complete in as few steps as possible
4. When you have completed the task, simply stop and provide your final response`;

            const actorRef = spawn("agentMachine", {
              id: `sub-agent-${agent.id}`,
              input: {
                agentId: agent.id,
                isSubAgent: true,
                task: agent.task,
                project: context.project,
                branch: context.branch,
                user: context.user,
                tools: context.tools,
                systemPrompt: subAgentSystemPrompt,
                modelId: context.modelId,
                maxIterations: 20,
                cooldownMs: context.cooldownMs,
                activeTools: ["bash", "search_codebase", "query_related_declarations"],
              },
            });

            actorRef.subscribe((snapshot) => {
              if (snapshot.status === "done") {
                const isFailed = snapshot.value === "failed";
                if (isFailed) {
                  const errorMessage =
                    (snapshot.context as { error?: Error | null })?.error?.message ??
                    "Sub-agent failed to complete task";
                  self.send({ type: "SUB_AGENT_FAILED", agentId: agent.id, error: errorMessage });
                } else {
                  self.send({
                    type: "SUB_AGENT_COMPLETE",
                    agentId: agent.id,
                    result: "Sub-agent completed task successfully",
                  });
                }
              } else if (snapshot.status === "error") {
                self.send({
                  type: "SUB_AGENT_FAILED",
                  agentId: agent.id,
                  error: "Sub-agent encountered an error",
                });
              }
            });

            actorRef.send({ type: "PROCESS" });

            return {
              ...agent,
              status: "running" as const,
              actorRef,
            };
          });
        },
      }),

      markAgentCompleted: assign({
        agents: ({ context, event }) => {
          if (event.type !== "SUB_AGENT_COMPLETE") {
            return context.agents;
          }

          return context.agents.map((agent) => {
            if (agent.id !== event.agentId) {
              return agent;
            }

            if (agent.actorRef) {
              stopChild(agent.actorRef as Parameters<typeof stopChild>[0]);
            }

            return {
              ...agent,
              status: "completed" as const,
              result: event.result,
              actorRef: undefined,
            };
          });
        },
      }),

      retryAgent: assign({
        agents: ({ context, event }) => {
          if (event.type !== "SUB_AGENT_FAILED") {
            return context.agents;
          }

          return context.agents.map((agent) => {
            if (agent.id !== event.agentId) {
              return agent;
            }

            if (agent.actorRef) {
              stopChild(agent.actorRef as Parameters<typeof stopChild>[0]);
            }

            return {
              ...agent,
              status: "waiting" as const,
              retryCount: agent.retryCount + 1,
              actorRef: undefined,
            };
          });
        },
      }),

      markAgentFailed: assign({
        agents: ({ context, event }) => {
          if (event.type !== "SUB_AGENT_FAILED") {
            return context.agents;
          }

          const failedAgentId = event.agentId;
          const dependentIds = getDependentAgents(context, failedAgentId);

          return context.agents.map((agent) => {
            if (agent.actorRef) {
              stopChild(agent.actorRef as Parameters<typeof stopChild>[0]);
            }

            if (agent.id === failedAgentId) {
              return {
                ...agent,
                status: "failed" as const,
                error: event.error,
                actorRef: undefined,
              };
            }

            if (dependentIds.includes(agent.id) && agent.status === "waiting") {
              return {
                ...agent,
                status: "failed" as const,
                error: `Dependency "${failedAgentId}" failed after max retries`,
                actorRef: undefined,
              };
            }

            return agent;
          });
        },
      }),

      stopAllAgents: ({ context }) => {
        for (const agent of context.agents) {
          if (agent.actorRef) {
            stopChild(agent.actorRef as Parameters<typeof stopChild>[0]);
          }
        }
      },

      sendCompletionToParent: sendParent(({ context }) => ({
        type: "_orchestrator.completed" as const,
        toolCallId: context.toolCallId,
        results: context.agents.map(
          (a): SubAgentResult => ({
            id: a.id,
            task: a.task,
            success: a.status === "completed",
            result: a.result ?? a.error ?? "No result",
          }),
        ),
      })),

      sendFailureToParent: sendParent(({ context }) => ({
        type: "_orchestrator.failed" as const,
        toolCallId: context.toolCallId,
        error: context.validationError ?? "Orchestration failed",
      })),
    },
  }).createMachine({
    id: "subAgentOrchestrator",
    initial: "validating",
    context: ({ input }) => ({
      toolCallId: input.toolCallId,
      agents: input.agents.map(
        (a): SubAgentState => ({
          id: a.id,
          task: a.task,
          context: a.context,
          depends: a.depends,
          status: "waiting",
          retryCount: 0,
        }),
      ),
      maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
      project: input.project,
      branch: input.branch,
      user: input.user,
      tools: input.tools,
      modelId: input.modelId,
      cooldownMs: input.cooldownMs,
    }),
    states: {
      validating: {
        entry: ["validateGraph"],
        always: [
          {
            guard: "isValidGraph",
            target: "orchestrating",
            actions: ["emitOrchestratorStarted"],
          },
          {
            target: "failed",
            actions: ["emitValidationFailed"],
          },
        ],
      },

      orchestrating: {
        always: [
          {
            guard: "allAgentsResolved",
            target: "completed",
          },
          {
            guard: "hasReadyAgents",
            actions: ["spawnReadyAgents"],
          },
        ],
        on: {
          SUB_AGENT_COMPLETE: {
            actions: [
              "markAgentCompleted",
              {
                type: "emitAgentCompleted",
                params: ({ event }) => ({
                  agentId: event.agentId,
                  result: event.result,
                }),
              },
            ],
            target: "orchestrating",
            reenter: true,
          },
          SUB_AGENT_FAILED: [
            {
              guard: "canRetry",
              actions: [
                "retryAgent",
                {
                  type: "emitAgentRetrying",
                  params: ({ context, event }) => {
                    const agent = context.agents.find((a) => a.id === event.agentId);
                    return {
                      agentId: event.agentId,
                      attempt: (agent?.retryCount ?? 0) + 1,
                      maxRetries: context.maxRetries,
                    };
                  },
                },
              ],
              target: "orchestrating",
              reenter: true,
            },
            {
              actions: [
                "markAgentFailed",
                {
                  type: "emitAgentFailed",
                  params: ({ event }) => ({
                    agentId: event.agentId,
                    error: event.error,
                    reason: "max_retries_exceeded" as const,
                  }),
                },
              ],
              target: "orchestrating",
              reenter: true,
            },
          ],
        },
      },

      completed: {
        entry: ["stopAllAgents", "emitOrchestratorCompleted", "sendCompletionToParent"],
        type: "final",
      },

      failed: {
        entry: ["stopAllAgents", "emitOrchestratorFailed", "sendFailureToParent"],
        type: "final",
      },
    },
  });
}

export type SubAgentOrchestratorMachine = ReturnType<typeof createSubAgentOrchestratorMachine>;
