import type { ModelMessage, ToolSet } from "ai";
import { assign, createActor, sendParent, setup } from "xstate";

import type { AiModel } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import type {
  AssistantContentArray,
  Branch,
  FinishReason,
  LLMUsage,
  PendingSpawnRequest,
  ProjectWithConfig,
  SubAgentBatchResult,
  SubAgentResult,
} from "@/actors/agent/agent-actor-types";
import { cooldownActor } from "@/actors/agent/cooldown";
import { llmStreamActor } from "@/actors/agent/llm-stream";
import { loadMessagesActor } from "@/actors/agent/load-messages";
import { runSubAgentsActor, type RunSubAgentInput } from "@/actors/agent/run-sub-agents";
import { saveMessagesActor } from "@/actors/agent/save-messages";
import type { User } from "@/lib/auth";

const SUB_AGENT_ACTIVE_TOOLS = ["bash", "search_codebase", "query_related_declarations"] as const;

const DEFAULT_MAX_SUB_AGENTS = 5;

type AgentContext = {
  project: ProjectWithConfig;
  branch: Branch;
  user: User;
  messages: ModelMessage[];
  assistantContent: AssistantContentArray;
  messageId: string;
  iterationCount: number;
  maxIterations: number;
  maxSubAgents: number;
  cooldownMs: number;
  tools: ToolSet;
  activeTools: string[] | undefined;
  systemPrompt: string;
  modelId: AiModel;
  error: Error | null;
  shouldContinue: boolean;
  lastUsage: LLMUsage | null;
  lastFinishReason: FinishReason | null;
  pendingSpawnRequests: PendingSpawnRequest[];
  subAgentResults: SubAgentResult[];
};

type AgentInput = {
  project: ProjectWithConfig;
  branch: Branch;
  user: User;
  tools: ToolSet;
  systemPrompt: string;
  modelId?: AiModel;
  maxIterations?: number;
  maxSubAgents?: number;
  cooldownMs?: number;
  activeTools?: string[];
};

type AgentEvent = { type: "PROCESS" } | { type: "CANCEL" } | { type: "ERROR"; error: Error };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Runs a single sub-agent to completion.
 */
const runSingleSubAgent = async ({
  project,
  branch,
  user,
  tools,
  agentTask,
  modelId,
  cooldownMs,
}: RunSubAgentInput): Promise<SubAgentResult> => {
  const logger = Logger.get({
    projectId: project.id,
    versionId: branch.headVersion.id,
  });

  const subAgentId = `sub-${nanoid().slice(0, 8)}`;
  logger.info(`Running sub-agent ${subAgentId}`, {
    extra: { task: agentTask.task.slice(0, 100) },
  });

  const subAgentSystemPrompt = `You are a sub-agent with a specific task.

TASK: ${agentTask.task}
${agentTask.context ? `\nCONTEXT: ${agentTask.context}` : ""}

RULES:
1. Focus ONLY on the assigned task
2. You CANNOT spawn other agents
3. Be efficient - complete in as few steps as possible
4. When you have completed the task, simply stop and provide your final response`;

  const subAgent = createActor(agentMachine, {
    input: {
      project,
      branch,
      user,
      tools,
      systemPrompt: subAgentSystemPrompt,
      modelId,
      maxIterations: 20,
      cooldownMs,
      activeTools: [...SUB_AGENT_ACTIVE_TOOLS],
    },
  });

  return new Promise((resolve) => {
    subAgent.subscribe((snapshot) => {
      if (snapshot.status === "done") {
        const isFailed = snapshot.value === "failed";
        const errorMessage = snapshot.context.error?.message ?? "Sub-agent failed to complete task";

        if (isFailed) {
          logger.error(`Sub-agent ${subAgentId} failed`, {
            extra: { error: errorMessage },
          });
          resolve({
            task: agentTask.task,
            success: false,
            result: errorMessage,
          });
          return;
        }

        logger.info(`Sub-agent ${subAgentId} completed`);
        resolve({
          task: agentTask.task,
          success: true,
          result: "Sub-agent completed task successfully",
        });
        return;
      }

      if (snapshot.status === "error") {
        logger.error(`Sub-agent ${subAgentId} failed with unexpected error`);
        resolve({
          task: agentTask.task,
          success: false,
          result: "Sub-agent failed to complete task",
        });
      }
    });

    subAgent.start();
    subAgent.send({ type: "PROCESS" });
  });
};

// ============================================================================
// Machine
// ============================================================================

export const agentMachine = setup({
  types: {
    context: {} as AgentContext,
    input: {} as AgentInput,
    events: {} as AgentEvent,
  },
  actors: {
    loadMessages: loadMessagesActor,
    saveMessages: saveMessagesActor,
    llmStream: llmStreamActor,
    cooldown: cooldownActor,
    runSubAgents: runSubAgentsActor,
  },
  actions: {
    logStart: ({ context }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        versionId: context.branch.headVersion.id,
      });
      logger.info("Agent machine started");
    },
    logIteration: ({ context }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        versionId: context.branch.headVersion.id,
      });
      logger.info(`Agent iteration ${context.iterationCount}`);
    },
    logComplete: ({ context }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        versionId: context.branch.headVersion.id,
      });
      logger.info("Agent machine completed", {
        extra: { iterations: context.iterationCount },
      });
    },
    logError: ({ context }) => {
      const logger = Logger.get({
        projectId: context.project.id,
        versionId: context.branch.headVersion.id,
      });
      logger.error("Agent machine failed", {
        extra: { error: context.error?.message },
      });
    },
    incrementIteration: assign({
      iterationCount: ({ context }) => context.iterationCount + 1,
    }),
    resetMessageId: assign({
      messageId: () => nanoid(),
    }),
    resetAssistantContent: assign({
      assistantContent: (): AssistantContentArray => [],
    }),
  },
  guards: {
    shouldContinueLoop: ({ context }) =>
      context.shouldContinue && context.iterationCount < context.maxIterations,
  },
}).createMachine({
  id: "agent",
  initial: "idle",
  context: ({ input }) => ({
    project: input.project,
    branch: input.branch,
    user: input.user,
    messages: [],
    assistantContent: [],
    messageId: nanoid(),
    iterationCount: 0,
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
  }),
  states: {
    idle: {
      on: {
        PROCESS: {
          target: "loading",
          actions: ["logStart"],
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
            "logIteration",
          ],
        },
        onError: {
          target: "failed",
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            "logError",
          ],
        },
      },
    },

    thinking: {
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
        onDone: [
          {
            target: "runningSubAgents",
            guard: ({ event }) => event.output.pendingSpawnRequests.length > 0,
            actions: assign({
              shouldContinue: ({ event }) => event.output.shouldContinue,
              assistantContent: ({ event }) => event.output.assistantContent,
              lastUsage: ({ event }) => event.output.usage,
              lastFinishReason: ({ event }) => event.output.finishReason,
              pendingSpawnRequests: ({ event }) => event.output.pendingSpawnRequests,
            }),
          },
          {
            target: "savingMessages",
            actions: assign({
              shouldContinue: ({ event }) => event.output.shouldContinue,
              assistantContent: ({ event }) => event.output.assistantContent,
              lastUsage: ({ event }) => event.output.usage,
              lastFinishReason: ({ event }) => event.output.finishReason,
              pendingSpawnRequests: () => [],
            }),
          },
        ],
        onError: {
          target: "failed",
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            "logError",
          ],
        },
      },
    },

    runningSubAgents: {
      invoke: {
        id: "runSubAgents",
        src: "runSubAgents",
        input: ({ context }) => ({
          project: context.project,
          branch: context.branch,
          user: context.user,
          tools: context.tools,
          pendingSpawnRequests: context.pendingSpawnRequests,
          modelId: context.modelId,
          cooldownMs: context.cooldownMs,
          runSubAgent: runSingleSubAgent,
        }),
        onDone: {
          target: "savingMessages",
          actions: assign({
            assistantContent: ({ context, event }) => {
              const batches = event.output as SubAgentBatchResult[];
              const toolResults = batches.map((batch) => ({
                type: "tool-result" as const,
                toolCallId: batch.toolCallId,
                toolName: "spawn_agents",
                output: {
                  type: "json" as const,
                  value: { results: batch.results },
                },
              }));
              return [...context.assistantContent, ...toolResults];
            },
            subAgentResults: ({ event }) =>
              (event.output as SubAgentBatchResult[]).flatMap((batch) => batch.results),
            shouldContinue: () => true,
            pendingSpawnRequests: () => [],
          }),
        },
        onError: {
          target: "savingMessages",
          actions: [
            ({ context, event }) => {
              const logger = Logger.get({
                projectId: context.project.id,
                versionId: context.branch.headVersion.id,
              });
              logger.error("Sub-agent execution failed", {
                extra: { error: (event.error as Error)?.message },
              });
            },
            assign({
              assistantContent: ({ context }) => {
                const toolResults = context.pendingSpawnRequests.map((request) => ({
                  type: "tool-result" as const,
                  toolCallId: request.toolCallId,
                  toolName: "spawn_agents",
                  output: {
                    type: "error-json" as const,
                    value: { success: false, error: "Sub-agent execution failed" },
                  },
                }));
                return [...context.assistantContent, ...toolResults];
              },
              shouldContinue: () => true,
              pendingSpawnRequests: () => [],
            }),
          ],
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
            actions: ["logComplete"],
          },
        ],
        onError: {
          target: "failed",
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            "logError",
          ],
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
      entry: [
        () => {
          Logger.info("Agent completed successfully");
        },
        sendParent({ type: "AGENT_COMPLETE" }),
      ],
    },

    failed: {
      type: "final",
      entry: [
        ({ context }) => {
          Logger.error("Agent failed", {
            extra: { error: context.error?.message },
          });
        },
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
      actions: () => {
        Logger.info("Agent cancelled by user");
      },
    },
    ERROR: {
      target: ".failed",
      actions: [
        assign({
          error: ({ event }) => event.error,
        }),
        "logError",
      ],
    },
  },
});

export type AgentMachine = typeof agentMachine;
export type AgentSnapshot = ReturnType<typeof agentMachine.getInitialSnapshot>;
