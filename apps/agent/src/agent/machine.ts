import { assign, emit, sendParent, sendTo, setup, type AnyActorRef } from "xstate";

import { nanoid } from "@weldr/shared/nanoid";

import { cooldownActor } from "@/agent/actors/cooldown";
import { llmStreamActor } from "@/agent/actors/llm-stream";
import { loadMessagesActor } from "@/agent/actors/load-messages";
import { saveMessagesActor } from "@/agent/actors/save-messages";
import {
  createSubAgentOrchestratorMachine,
  type SubAgentResult as OrchestratorSubAgentResult,
} from "@/agent/orchestrator";
import type {
  AgentContext,
  AgentInput,
  AssistantContentArray,
  SubAgentResult,
} from "@/agent/types";
import type {
  AgentEmittedEvent,
  AssistantContentPart,
  FinishReason,
  LLMUsage,
  PendingSpawnRequest,
} from "@/core/events";
import { MetricsCollector } from "@/core/metrics";

const DEFAULT_MAX_SUB_AGENTS = 10;

const normalizeError = (error: unknown): Error => {
  return error instanceof Error ? error : new Error(String(error));
};

type AgentMachineEvent =
  | { type: "PROCESS" }
  | { type: "CANCEL" }
  | { type: "ERROR"; error: Error }
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
  | { type: "_orchestrator.completed"; toolCallId: string; results: OrchestratorSubAgentResult[] }
  | { type: "_orchestrator.failed"; toolCallId: string; error: string };

const agentMachineSetup = setup({
  types: {
    context: {} as AgentContext,
    input: {} as AgentInput,
    events: {} as AgentMachineEvent,
    emitted: {} as AgentEmittedEvent,
  },
  actors: {
    loadMessages: loadMessagesActor,
    saveMessages: saveMessagesActor,
    llmStream: llmStreamActor,
    cooldown: cooldownActor,
  },
  actions: {
    emitAgentStarted: emit(({ context }) => ({
      type: "agent.started",
      agentId: context.agentId,
      modelId: context.modelId,
      isSubAgent: context.isSubAgent,
      task: context.task,
    })),
    emitIterationStarted: emit(({ context }) => ({
      type: "agent.iteration.started",
      agentId: context.agentId,
      iteration: context.iterationCount,
    })),
    emitIterationCompleted: emit(({ context }) => ({
      type: "agent.iteration.completed",
      agentId: context.agentId,
      iteration: context.iterationCount,
      usage: context.lastUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: context.lastFinishReason ?? "unknown",
      durationMs: context.iterationStartedAt ? Date.now() - context.iterationStartedAt : 0,
    })),
    emitAgentCompleted: emit(({ context }) => ({
      type: "agent.completed",
      agentId: context.agentId,
      metrics: context.metrics.getAgentMetrics(),
    })),
    emitAgentFailed: emit(({ context }) => ({
      type: "agent.failed",
      agentId: context.agentId,
      error: {
        message: context.error?.message ?? "Unknown agent error",
        stack: context.error?.stack,
      },
      metrics: context.metrics.getAgentMetrics(),
    })),
    emitAgentCancelled: emit(({ context }) => ({
      type: "agent.cancelled",
      agentId: context.agentId,
    })),
    recordAgentDuration: ({ context }) => {
      context.metrics.recordAgentDuration(Date.now() - context.agentStartedAt);
    },
    setIterationStart: assign({
      iterationStartedAt: () => Date.now(),
    }),
    incrementIteration: assign({
      iterationCount: ({ context }) => {
        context.metrics.recordIteration();
        return context.iterationCount + 1;
      },
    }),
    resetMessageId: assign({
      messageId: () => nanoid(),
    }),
    resetAssistantContent: assign({
      assistantContent: (): AssistantContentArray => [],
    }),
    stopOrchestrators: assign(({ context }) => {
      for (const ref of context.orchestratorRefs.values()) {
        try {
          ref.stop();
        } catch {
          // Ignore if already stopped
        }
      }
      return { orchestratorRefs: new Map<string, AnyActorRef>() };
    }),
    clearOrchestrators: assign({
      orchestratorRefs: () => new Map<string, AnyActorRef>(),
    }),
    spawnOrchestrators: assign({
      orchestratorRefs: ({ context, spawn }) => {
        const orchestratorMachine = createSubAgentOrchestratorMachine({
          agentMachine,
        });

        const refs = new Map<string, AnyActorRef>();

        for (const request of context.pendingSpawnRequests) {
          const spawnAny = spawn as (
            logic: unknown,
            options: { id: string; input: unknown },
          ) => AnyActorRef;

          const actorRef = spawnAny(orchestratorMachine, {
            id: `orchestrator-${request.toolCallId}`,
            input: {
              toolCallId: request.toolCallId,
              agents: request.agents.map((agent) => ({
                id: agent.id,
                task: agent.task,
                context: agent.context,
                depends: agent.depends ?? [],
              })),
              maxRetries: 3,
              project: context.project,
              branch: context.branch,
              user: context.user,
              tools: context.tools,
              modelId: context.modelId,
              cooldownMs: context.cooldownMs,
            },
          });

          refs.set(request.toolCallId, actorRef);
        }

        return refs;
      },
    }),
    processOrchestratorComplete: assign({
      assistantContent: ({ context, event }) => {
        if (event.type !== "_orchestrator.completed") {
          return context.assistantContent;
        }

        const toolResult = {
          type: "tool-result" as const,
          toolCallId: event.toolCallId,
          toolName: "spawn_agents",
          output: {
            type: "json" as const,
            value: { results: event.results },
          },
        };

        return [...context.assistantContent, toolResult];
      },
      subAgentResults: ({ context, event }) => {
        if (event.type !== "_orchestrator.completed") {
          return context.subAgentResults;
        }

        const newResults: SubAgentResult[] = event.results.map((r) => ({
          id: r.id,
          task: r.task,
          success: r.success,
          result: r.result,
        }));

        return [...context.subAgentResults, ...newResults];
      },
      orchestratorRefs: ({ context, event }) => {
        if (event.type !== "_orchestrator.completed") {
          return context.orchestratorRefs;
        }

        const refs = new Map(context.orchestratorRefs);
        refs.delete(event.toolCallId);
        return refs;
      },
    }),
    processOrchestratorFailed: assign({
      assistantContent: ({ context, event }) => {
        if (event.type !== "_orchestrator.failed") {
          return context.assistantContent;
        }

        const toolResult = {
          type: "tool-result" as const,
          toolCallId: event.toolCallId,
          toolName: "spawn_agents",
          output: {
            type: "error-json" as const,
            value: { success: false, error: event.error },
          },
        };

        return [...context.assistantContent, toolResult];
      },
      orchestratorRefs: ({ context, event }) => {
        if (event.type !== "_orchestrator.failed") {
          return context.orchestratorRefs;
        }

        const refs = new Map(context.orchestratorRefs);
        refs.delete(event.toolCallId);
        return refs;
      },
    }),
  },
  guards: {
    shouldContinueLoop: ({ context }) =>
      context.shouldContinue && context.iterationCount < context.maxIterations,
    allOrchestratorsComplete: ({ context }) => context.orchestratorRefs.size === 0,
  },
});

export const agentMachine = agentMachineSetup.createMachine({
  id: "agent",
  initial: "idle",
  context: ({ input }) => ({
    agentId: input.agentId ?? nanoid(),
    isSubAgent: input.isSubAgent ?? false,
    parentAgentId: input.parentAgentId,
    task: input.task,
    project: input.project,
    branch: input.branch,
    user: input.user,
    messages: [],
    assistantContent: [],
    messageId: nanoid(),
    iterationCount: 0,
    iterationStartedAt: null,
    agentStartedAt: Date.now(),
    maxIterations: input.maxIterations ?? 100,
    maxSubAgents: Math.min(input.maxSubAgents ?? DEFAULT_MAX_SUB_AGENTS, DEFAULT_MAX_SUB_AGENTS),
    cooldownMs: input.cooldownMs ?? 100,
    tools: input.tools,
    activeTools: input.activeTools,
    systemPrompt: input.systemPrompt,
    modelId: input.modelId ?? "google:gemini-2.5-pro",
    error: null,
    shouldContinue: false,
    lastUsage: null,
    lastFinishReason: null,
    pendingSpawnRequests: [],
    subAgentResults: [],
    metrics: new MetricsCollector(),
    orchestratorRefs: new Map<string, AnyActorRef>(),
  }),
  states: {
    idle: {
      on: {
        PROCESS: {
          target: "loading",
          actions: ["emitAgentStarted"],
        },
      },
    },

    loading: {
      entry: ["resetMessageId", "resetAssistantContent"],
      invoke: {
        id: "loadMessages",
        src: "loadMessages",
        input: ({ context }) => ({
          chatId: context.branch.headVersion.chatId,
        }),
        onDone: {
          target: "thinking",
          actions: [
            assign({
              messages: ({ event }) => event.output,
            }),
            "incrementIteration",
            "emitIterationStarted",
          ],
        },
        onError: {
          target: "failed",
          actions: assign({
            error: ({ event }) => normalizeError(event.error),
          }),
        },
      },
    },

    thinking: {
      entry: ["setIterationStart"],
      invoke: {
        id: "llmStream",
        src: "llmStream",
        input: ({ context }) => ({
          messages: context.messages,
          tools: context.tools,
          activeTools: context.activeTools,
          systemPrompt: context.systemPrompt,
          modelId: context.modelId,
          chatId: context.branch.headVersion.chatId,
          messageId: context.messageId,
          maxSubAgents: context.maxSubAgents,
        }),
      },
      on: {
        "_llm.completed": [
          {
            target: "runningSubAgents",
            guard: ({ event }) => event.pendingSpawnRequests.length > 0,
            actions: [
              assign({
                shouldContinue: ({ event }) =>
                  event.finishReason === "tool-calls" || event.finishReason === "length",
                assistantContent: ({ event }) => event.content as AssistantContentArray,
                lastUsage: ({ event }) => event.usage,
                lastFinishReason: ({ event }) => event.finishReason,
                pendingSpawnRequests: ({ event }) => event.pendingSpawnRequests,
              }),
              "emitIterationCompleted",
            ],
          },
          {
            target: "savingMessages",
            actions: [
              assign({
                shouldContinue: ({ event }) =>
                  event.finishReason === "tool-calls" || event.finishReason === "length",
                assistantContent: ({ event }) => event.content as AssistantContentArray,
                lastUsage: ({ event }) => event.usage,
                lastFinishReason: ({ event }) => event.finishReason,
                pendingSpawnRequests: () => [],
              }),
              "emitIterationCompleted",
            ],
          },
        ],
        "_llm.cancelled": {
          target: "completed",
          actions: ["emitAgentCancelled"],
        },
        "_llm.error": {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    runningSubAgents: {
      entry: ["spawnOrchestrators"],
      always: {
        target: "savingMessages",
        guard: "allOrchestratorsComplete",
        actions: [
          assign({
            shouldContinue: () => true,
            pendingSpawnRequests: () => [],
          }),
        ],
      },
      on: {
        "_orchestrator.completed": {
          actions: ["processOrchestratorComplete"],
        },
        "_orchestrator.failed": {
          actions: ["processOrchestratorFailed"],
        },
      },
    },

    savingMessages: {
      invoke: {
        id: "saveMessages",
        src: "saveMessages",
        input: ({ context }) => ({
          chatId: context.branch.headVersion.chatId,
          userId: context.user.id,
          messageId: context.messageId,
          assistantContent: context.assistantContent,
          modelId: context.modelId,
          usage: context.lastUsage,
          finishReason: context.lastFinishReason,
        }),
        onDone: [
          {
            target: "cooldown",
            guard: "shouldContinueLoop",
          },
          {
            target: "completed",
          },
        ],
        onError: {
          target: "failed",
          actions: assign({
            error: ({ event }) => normalizeError(event.error),
          }),
        },
      },
    },

    cooldown: {
      invoke: {
        id: "cooldown",
        src: "cooldown",
        input: ({ context }) => ({
          ms: context.cooldownMs,
        }),
        onDone: {
          target: "loading",
        },
      },
    },

    completed: {
      type: "final",
      entry: ["recordAgentDuration", "emitAgentCompleted", sendParent({ type: "AGENT_COMPLETE" })],
    },

    failed: {
      type: "final",
      entry: [
        "stopOrchestrators",
        "clearOrchestrators",
        "recordAgentDuration",
        "emitAgentFailed",
        sendParent(({ context }) => ({
          type: "AGENT_ERROR" as const,
          error: context.error ?? new Error("Unknown agent error"),
        })),
      ],
    },
  },

  on: {
    CANCEL: {
      target: ".completed",
      actions: [
        sendTo("llmStream", { type: "LLM.CANCEL", reason: "agent cancelled" }),
        "stopOrchestrators",
        "clearOrchestrators",
        "emitAgentCancelled",
      ],
    },
    ERROR: {
      target: ".failed",
      actions: assign({
        error: ({ event }) => normalizeError(event.error),
      }),
    },
  },
});

export type AgentMachine = typeof agentMachine;
export type AgentSnapshot = ReturnType<typeof agentMachine.getInitialSnapshot>;
