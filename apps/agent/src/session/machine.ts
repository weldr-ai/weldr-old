/**
 * Unified Session Machine
 *
 * A single state machine that handles the complete conversation flow:
 * - Session initialization (tools, system prompt)
 * - Waiting for user input
 * - LLM streaming with cancellation support
 * - Tool execution
 * - Sub-agent orchestration
 * - Message persistence
 * - Session finalization
 *
 * This machine is fully event-driven and follows the actor model.
 * All coordination happens via message passing, not state variables.
 */

import type { AssistantContent, ModelMessage } from "ai";
import {
  assign,
  createActor,
  emit,
  fromPromise,
  sendTo,
  setup,
  stopChild,
  type AnyActorRef,
} from "xstate";

import type { AiModel } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { agentMachine } from "@/agent/machine";
import { createSubAgentOrchestratorMachine } from "@/agent/orchestrator";
import { getMessages, insertMessages } from "@/ai/messages";
import { calculateModelCost } from "@/ai/providers";
import type {
  AssistantContentPart,
  AwaitingUserKind,
  FinishReason,
  LLMUsage,
  PublicSessionEvent,
  SessionState,
} from "@/core/events";
import { MetricsCollector } from "@/core/metrics";
import { sessionStorage } from "@/core/persistence";
import { finalizeSessionActor } from "./actors/finalize-session";
import { initializeSessionActor } from "./actors/initialize-session";
import { llmStreamActor } from "./actors/llm-stream";
import type { SessionMachineContext, SessionMachineEvents, SessionMachineInput } from "./types";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MODEL_ID = "google:gemini-2.5-pro" as const;
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_SUB_AGENTS = 10;
const DEFAULT_COOLDOWN_MS = 100;

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function shouldContinueLoop(context: SessionMachineContext): boolean {
  // Continue if:
  // 1. Finish reason is tool-calls (LLM wants to call more tools)
  // 2. We haven't exceeded max iterations
  return (
    context.lastFinishReason === "tool-calls" && context.iterationCount < context.maxIterations
  );
}

function needsUserInput(context: SessionMachineContext): boolean {
  // Need user input if:
  // 1. Finish reason is "stop" (LLM finished responding)
  // 2. Finish reason is "length" (hit token limit, but not tool calls)
  return context.lastFinishReason === "stop" || context.lastFinishReason === "length";
}

// =============================================================================
// Promise Actors for Simple Operations
// =============================================================================

const loadMessagesActor = fromPromise<ModelMessage[], { chatId: string }>(async ({ input }) => {
  const messages = await getMessages(input.chatId);
  return messages;
});

const saveMessagesActor = fromPromise<
  void,
  {
    chatId: string;
    userId: string;
    messageId: string;
    assistantContent: AssistantContentPart[];
    modelId: string;
    usage: LLMUsage | null;
    finishReason: FinishReason | null;
  }
>(async ({ input }) => {
  const cost = await calculateModelCost(
    input.modelId as AiModel,
    input.usage?.inputTokens ?? 0,
    input.usage?.outputTokens ?? 0,
  );

  const finishReason = input.finishReason ?? "unknown";

  // Map content parts to the format expected by insertMessages
  // Use type assertion to satisfy AI SDK types which expect the exact AssistantContent format
  const content = input.assistantContent.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text" as const, text: part.text };
      case "reasoning":
        return { type: "reasoning" as const, text: part.text, providerOptions: {} };
      case "tool-call":
        return {
          type: "tool-call" as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.args,
        };
      case "tool-result":
        return {
          type: "tool-result" as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.result,
        };
      default: {
        const _exhaustive: never = part;
        throw new Error(
          `Unhandled content part type: ${(_exhaustive as AssistantContentPart).type}`,
        );
      }
    }
  }) as Exclude<AssistantContent, string>;

  await insertMessages({
    input: {
      chatId: input.chatId,
      userId: input.userId,
      messages: [
        {
          id: input.messageId,
          role: "assistant",
          content,
          metadata: {
            provider: "google",
            model: "gemini-2.5-pro",
            inputTokens: input.usage?.inputTokens,
            outputTokens: input.usage?.outputTokens,
            totalTokens: input.usage?.totalTokens,
            inputCost: cost?.inputCost,
            outputCost: cost?.outputCost,
            totalCost: cost?.totalCost,
            finishReason,
          },
          createdAt: new Date(),
        },
      ],
    },
  });
});

const cooldownActor = fromPromise<void, { ms: number }>(async ({ input }) => {
  await new Promise((resolve) => setTimeout(resolve, input.ms));
});

const persistStateActor = fromPromise<void, { context: SessionMachineContext }>(
  async ({ input }) => {
    const { context } = input;

    await sessionStorage.saveSessionState({
      versionId: context.versionId,
      sessionState: context.sessionState,
      awaitingUserKind: context.awaitingUserKind,
      traceId: context.traceId,
      currentMessageId: context.currentMessageId,
      iterationCount: context.iterationCount,
      pendingSpawnRequests: context.pendingSpawnRequests,
      assistantContentBuffer: null, // TODO: Serialize if needed
      pausedAt: context.pausedAt ? new Date(context.pausedAt) : null,
      pauseReason: context.pauseReason,
    });

    // Also update version metrics
    const metrics = context.metrics.getMetrics();
    await sessionStorage.updateVersionMetrics(context.versionId, {
      inputTokens: metrics.agent.llm.inputTokens,
      outputTokens: metrics.agent.llm.outputTokens,
      totalCost: metrics.agent.llm.totalCost,
      iterations: metrics.agent.iterations,
    });
  },
);

// =============================================================================
// Session Machine Definition
// =============================================================================

export const sessionMachine = setup({
  types: {
    context: {} as SessionMachineContext,
    input: {} as SessionMachineInput,
    events: {} as SessionMachineEvents,
    emitted: {} as PublicSessionEvent,
  },
  actors: {
    initializeSession: initializeSessionActor,
    loadMessages: loadMessagesActor,
    llmStream: llmStreamActor,
    saveMessages: saveMessagesActor,
    cooldown: cooldownActor,
    finalizeSession: finalizeSessionActor,
    persistState: persistStateActor,
  },
  guards: {
    shouldContinueLoop: ({ context }) => shouldContinueLoop(context),
    needsUserInput: ({ context }) => needsUserInput(context),
    hasSpawnRequests: ({ context }) => context.pendingSpawnRequests.length > 0,
    allOrchestratorsComplete: ({ context }) => context.orchestratorRefs.size === 0,
    isRestoredToAwaitingUser: ({ context }) => context.sessionState === "awaitingUser",
    isRestoredToProcessing: ({ context }) => context.sessionState === "processing",
  },
  actions: {
    // Session lifecycle events
    emitSessionStarted: emit(({ context }) => ({
      type: "session.started" as const,
      versionId: context.versionId,
      traceId: context.traceId,
    })),

    emitSessionStateEntered: emit((_, params: { state: string; previousState?: string }) => ({
      type: "session.state.entered" as const,
      state: params.state as SessionState,
      previousState: params.previousState as SessionState | undefined,
    })),

    emitSessionAwaitingUser: emit(({ context }) => ({
      type: "session.awaiting_user" as const,
      kind: context.awaitingUserKind ?? ("message" as const),
    })),

    emitSessionCompleted: emit(({ context }) => ({
      type: "session.completed" as const,
      metrics: {
        totalDurationMs: Date.now() - context.startedAt,
        iterations: context.iterationCount,
        inputTokens: context.metrics.getMetrics().agent.llm.inputTokens,
        outputTokens: context.metrics.getMetrics().agent.llm.outputTokens,
        totalCost: context.metrics.getMetrics().agent.llm.totalCost,
      },
    })),

    emitSessionFailed: emit(({ context }) => ({
      type: "session.failed" as const,
      error: {
        message: context.error?.message ?? "Unknown error",
        stack: context.error?.stack,
      },
      metrics: {
        totalDurationMs: Date.now() - context.startedAt,
        iterations: context.iterationCount,
        inputTokens: context.metrics.getMetrics().agent.llm.inputTokens,
        outputTokens: context.metrics.getMetrics().agent.llm.outputTokens,
        totalCost: context.metrics.getMetrics().agent.llm.totalCost,
      },
    })),

    emitSessionCancelled: emit(() => ({
      type: "session.cancelled" as const,
    })),

    // Iteration events
    emitIterationStarted: emit(({ context }) => ({
      type: "iteration.started" as const,
      iteration: context.iterationCount,
    })),

    emitIterationCompleted: emit(({ context }) => ({
      type: "iteration.completed" as const,
      iteration: context.iterationCount,
      usage: context.lastUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: context.iterationStartedAt ? Date.now() - context.iterationStartedAt : 0,
    })),

    // Context mutations
    setSessionState: assign({
      sessionState: (_, params: { state: SessionState }) => params.state,
    }),

    setAwaitingUserKind: assign({
      awaitingUserKind: (_, params: { kind: AwaitingUserKind | null }) => params.kind,
    }),

    resetMessageId: assign({
      currentMessageId: () => nanoid(),
    }),

    resetAssistantContent: assign({
      assistantContent: (): AssistantContentPart[] => [],
    }),

    setIterationStart: assign({
      iterationStartedAt: () => Date.now(),
    }),

    incrementIteration: assign({
      iterationCount: ({ context }) => {
        context.metrics.recordIteration();
        return context.iterationCount + 1;
      },
    }),

    recordLLMUsage: assign({
      lastUsage: (_, params: { usage: LLMUsage; finishReason: FinishReason }) => params.usage,
      lastFinishReason: (_, params: { usage: LLMUsage; finishReason: FinishReason }) =>
        params.finishReason,
    }),

    setError: assign({
      error: (_, params: { error: Error }) => params.error,
    }),

    // Orchestrator management
    stopOrchestrators: ({ context }) => {
      for (const [, ref] of context.orchestratorRefs) {
        try {
          stopChild(ref);
        } catch {
          // Ignore if already stopped
        }
      }
    },

    clearOrchestrators: assign({
      orchestratorRefs: () => new Map(),
    }),

    processOrchestratorComplete: assign({
      assistantContent: ({ context, event }) => {
        if (event.type !== "_orchestrator.completed") {
          return context.assistantContent;
        }

        const toolResult: AssistantContentPart = {
          type: "tool-result",
          toolCallId: event.toolCallId,
          toolName: "spawn_agents",
          result: { results: event.results },
        };

        return [...context.assistantContent, toolResult];
      },
      subAgentResults: ({ context, event }) => {
        if (event.type !== "_orchestrator.completed") {
          return context.subAgentResults;
        }

        return [...context.subAgentResults, ...event.results];
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

        const toolResult: AssistantContentPart = {
          type: "tool-result",
          toolCallId: event.toolCallId,
          toolName: "spawn_agents",
          result: { success: false, error: event.error },
          isError: true,
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

    // Cancel LLM stream
    cancelLLMStream: sendTo("llmStream", { type: "LLM.CANCEL", reason: "user_cancelled" }),
  },
}).createMachine({
  id: "session",
  initial: "restoringState",

  context: ({ input }) => ({
    // Identity
    versionId: input.versionId,
    traceId: input.traceId,

    // Domain objects
    project: input.project,
    branch: input.branch,
    user: input.user,

    // Session state (restored or default)
    sessionState: input.restoredSnapshot?.state ?? "idle",
    awaitingUserKind: input.restoredSnapshot?.awaitingUserKind ?? null,

    // Agent execution state
    tools: {},
    systemPrompt: "",
    modelId: input.agentConfig?.modelId ?? DEFAULT_MODEL_ID,
    maxIterations: input.agentConfig?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    maxSubAgents: Math.min(
      input.agentConfig?.maxSubAgents ?? DEFAULT_MAX_SUB_AGENTS,
      DEFAULT_MAX_SUB_AGENTS,
    ),
    cooldownMs: input.agentConfig?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    activeTools: input.agentConfig?.activeTools,

    // LLM state (restored or default)
    messages: [],
    assistantContent: [],
    currentMessageId: input.restoredSnapshot?.currentMessageId ?? nanoid(),
    iterationCount: input.restoredSnapshot?.iterationCount ?? 0,
    iterationStartedAt: null,
    lastUsage: null,
    lastFinishReason: null,

    // Sub-agent state (restored or default)
    pendingSpawnRequests: input.restoredSnapshot?.pendingSpawnRequests ?? [],
    subAgentResults: [],
    orchestratorRefs: new Map(),

    // Error state
    error: null,

    // Metrics
    metrics: new MetricsCollector(),
    startedAt: Date.now(),
    initializingStartedAt: null,
    finalizingStartedAt: null,

    // Pause state
    pausedAt: input.restoredSnapshot?.pausedAt ?? null,
    pauseReason: input.restoredSnapshot?.pauseReason ?? null,
  }),

  states: {
    // State restoration from database
    restoringState: {
      always: [
        {
          target: "awaitingUser",
          guard: "isRestoredToAwaitingUser",
        },
        {
          target: "idle",
        },
      ],
    },

    // Waiting for first message
    idle: {
      on: {
        "_user.message": {
          target: "initializing",
          actions: [
            "emitSessionStarted",
            {
              type: "setSessionState",
              params: { state: "initializing" as const },
            },
          ],
        },
        START: {
          target: "initializing",
          actions: [
            "emitSessionStarted",
            {
              type: "setSessionState",
              params: { state: "initializing" as const },
            },
          ],
        },
      },
    },

    // Initialize tools, system prompt
    initializing: {
      entry: assign({ initializingStartedAt: () => Date.now() }),
      invoke: {
        id: "initializeSession",
        src: "initializeSession",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "processing",
          actions: [
            assign({
              tools: ({ event }) => event.output.tools,
              systemPrompt: ({ event }) => event.output.systemPrompt,
            }),
            {
              type: "setSessionState",
              params: { state: "processing" as const },
            },
            {
              type: "emitSessionStateEntered",
              params: { state: "processing", previousState: "initializing" },
            },
          ],
        },
        onError: {
          target: "failed",
          actions: [
            {
              type: "setError",
              params: ({ event }) => ({ error: normalizeError(event.error) }),
            },
          ],
        },
      },
    },

    // Main processing compound state
    processing: {
      initial: "loadingMessages",

      states: {
        loadingMessages: {
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
              target: "#session.failed",
              actions: [
                {
                  type: "setError",
                  params: ({ event }) => ({ error: normalizeError(event.error) }),
                },
              ],
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
              messageId: context.currentMessageId,
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
                    assistantContent: ({ event }) => event.content,
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
                    assistantContent: ({ event }) => event.content,
                    lastUsage: ({ event }) => event.usage,
                    lastFinishReason: ({ event }) => event.finishReason,
                    pendingSpawnRequests: () => [],
                  }),
                  "emitIterationCompleted",
                ],
              },
            ],
            "_llm.cancelled": {
              target: "#session.cancelled",
            },
            "_llm.error": {
              target: "#session.failed",
              actions: [
                {
                  type: "setError",
                  params: ({ event }) => ({ error: event.error }),
                },
              ],
            },
            "_control.cancel": {
              actions: "cancelLLMStream",
            },
          },
        },

        runningSubAgents: {
          entry: [
            assign({
              orchestratorRefs: ({ context, self }) => {
                const orchestratorMachine = createSubAgentOrchestratorMachine({
                  agentMachine,
                });

                const refs = new Map<string, AnyActorRef>();

                for (const request of context.pendingSpawnRequests) {
                  const orchestratorActor = createActor(orchestratorMachine, {
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

                  orchestratorActor.subscribe((snapshot) => {
                    if (snapshot.status === "done") {
                      const orchestratorContext = snapshot.context as {
                        agents: Array<{
                          id: string;
                          task: string;
                          status: string;
                          result?: string;
                          error?: string;
                        }>;
                        validationError?: string;
                      };

                      const results = orchestratorContext.agents.map((a) => ({
                        id: a.id,
                        task: a.task,
                        success: a.status === "completed",
                        result: a.result ?? a.error ?? "No result",
                      }));

                      if (orchestratorContext.validationError) {
                        self.send({
                          type: "_orchestrator.failed",
                          toolCallId: request.toolCallId,
                          error: orchestratorContext.validationError,
                        });
                      } else {
                        self.send({
                          type: "_orchestrator.completed",
                          toolCallId: request.toolCallId,
                          results,
                        });
                      }
                    }
                  });

                  orchestratorActor.start();
                  refs.set(request.toolCallId, orchestratorActor);
                }

                return refs;
              },
            }),
          ],
          on: {
            "_orchestrator.completed": {
              actions: ["processOrchestratorComplete"],
            },
            "_orchestrator.failed": {
              actions: ["processOrchestratorFailed"],
            },
          },
          always: {
            target: "savingMessages",
            guard: "allOrchestratorsComplete",
            actions: [
              assign({
                pendingSpawnRequests: () => [],
              }),
            ],
          },
        },

        savingMessages: {
          invoke: {
            id: "saveMessages",
            src: "saveMessages",
            input: ({ context }) => ({
              chatId: context.branch.headVersion.chatId,
              userId: context.user.id,
              messageId: context.currentMessageId,
              assistantContent: context.assistantContent,
              modelId: context.modelId,
              usage: context.lastUsage,
              finishReason: context.lastFinishReason,
            }),
            onDone: {
              target: "deciding",
            },
            onError: {
              target: "#session.failed",
              actions: [
                {
                  type: "setError",
                  params: ({ event }) => ({ error: normalizeError(event.error) }),
                },
              ],
            },
          },
        },

        deciding: {
          // Persist state after each iteration
          invoke: {
            src: "persistState",
            input: ({ context }) => ({ context }),
            onDone: [
              {
                target: "#session.awaitingUser",
                guard: "needsUserInput",
                actions: [
                  {
                    type: "setSessionState",
                    params: { state: "awaitingUser" as const },
                  },
                  {
                    type: "setAwaitingUserKind",
                    params: { kind: "message" as const },
                  },
                ],
              },
              {
                target: "cooldown",
                guard: "shouldContinueLoop",
              },
              {
                target: "#session.finalizing",
              },
            ],
            onError: {
              // Non-fatal, continue anyway
              target: "cooldown",
              guard: "shouldContinueLoop",
            },
          },
        },

        cooldown: {
          invoke: {
            id: "cooldown",
            src: "cooldown",
            input: ({ context }) => ({ ms: context.cooldownMs }),
            onDone: {
              target: "loadingMessages",
            },
          },
        },
      },
    },

    // Waiting for user input
    awaitingUser: {
      entry: [
        "emitSessionAwaitingUser",
        // Persist state so we can resume later
        // This is fire-and-forget
      ],
      on: {
        "_user.message": {
          target: "processing",
          actions: [
            {
              type: "setSessionState",
              params: { state: "processing" as const },
            },
            {
              type: "setAwaitingUserKind",
              params: { kind: null },
            },
          ],
        },
        "_user.confirmation": {
          target: "processing",
          actions: [
            {
              type: "setSessionState",
              params: { state: "processing" as const },
            },
            {
              type: "setAwaitingUserKind",
              params: { kind: null },
            },
          ],
        },
        "_user.selection": {
          target: "processing",
          actions: [
            {
              type: "setSessionState",
              params: { state: "processing" as const },
            },
            {
              type: "setAwaitingUserKind",
              params: { kind: null },
            },
          ],
        },
        "_control.cancel": {
          target: "cancelled",
        },
      },
    },

    // Finalize session (git commit, etc)
    finalizing: {
      entry: [
        assign({ finalizingStartedAt: () => Date.now() }),
        {
          type: "setSessionState",
          params: { state: "finalizing" as const },
        },
      ],
      invoke: {
        id: "finalizeSession",
        src: "finalizeSession",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "completed",
        },
        onError: {
          target: "failed",
          actions: [
            {
              type: "setError",
              params: ({ event }) => ({ error: normalizeError(event.error) }),
            },
          ],
        },
      },
    },

    // Terminal states
    completed: {
      type: "final",
      entry: [
        {
          type: "setSessionState",
          params: { state: "completed" as const },
        },
        "emitSessionCompleted",
      ],
    },

    failed: {
      type: "final",
      entry: [
        "stopOrchestrators",
        "clearOrchestrators",
        {
          type: "setSessionState",
          params: { state: "failed" as const },
        },
        "emitSessionFailed",
      ],
    },

    cancelled: {
      type: "final",
      entry: [
        "stopOrchestrators",
        "clearOrchestrators",
        {
          type: "setSessionState",
          params: { state: "cancelled" as const },
        },
        "emitSessionCancelled",
      ],
    },
  },

  // Global event handlers
  on: {
    "_control.cancel": {
      target: ".cancelled",
    },
    ACTOR_ERROR: {
      target: ".failed",
      actions: [
        {
          type: "setError",
          params: ({ event }) => ({ error: event.error }),
        },
      ],
    },
  },
});

export type SessionMachine = typeof sessionMachine;
export type SessionSnapshot = ReturnType<typeof sessionMachine.getInitialSnapshot>;
