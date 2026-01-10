import type { ModelMessage, ToolSet } from "ai";
import { assign, createActor, setup } from "xstate";

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
  SubAgentResult,
} from "@/actors/agent/agent-actor-types";
import { cooldownActor } from "@/actors/agent/cooldown";
import { llmStreamActor } from "@/actors/agent/llm-stream";
import { loadMessagesActor } from "@/actors/agent/load-messages";
import { runSubAgentsActor, type RunSubAgentInput } from "@/actors/agent/run-sub-agents";
import { saveMessagesActor } from "@/actors/agent/save-messages";
import { SUB_AGENT_ACTIVE_TOOLS } from "@/ai/tools/spawn-agent";
import type { User } from "@/lib/auth";

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
  calledComplete: boolean;
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

type AgentEvent =
  | { type: "PROCESS" }
  | { type: "CANCEL" }
  | { type: "ERROR"; error: Error }
  | { type: "SUB_AGENT_DONE"; toolCallId: string; result: string }
  | { type: "SUB_AGENT_ERROR"; toolCallId: string; error: string };

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
3. Call "complete" tool when finished
4. Be efficient - complete in as few steps as possible`;

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
        logger.info(`Sub-agent ${subAgentId} completed`);
        resolve({
          task: agentTask.task,
          success: true,
          result: "Sub-agent completed task successfully",
        });
      } else if (snapshot.status === "error") {
        logger.error(`Sub-agent ${subAgentId} failed`);
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
      context.shouldContinue &&
      !context.calledComplete &&
      context.iterationCount < context.maxIterations,
    calledCompleteTool: ({ context }) => context.calledComplete,
    hasPendingSpawnRequests: ({ context }) => context.pendingSpawnRequests.length > 0,
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
    maxSubAgents: input.maxSubAgents ?? DEFAULT_MAX_SUB_AGENTS,
    cooldownMs: input.cooldownMs ?? 100,
    tools: input.tools,
    activeTools: input.activeTools,
    systemPrompt: input.systemPrompt,
    modelId: input.modelId ?? "google:gemini-2.5-pro",
    error: null,
    shouldContinue: false,
    calledComplete: false,
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
              calledComplete: ({ event }) => event.output.calledComplete,
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
              calledComplete: ({ event }) => event.output.calledComplete,
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
          agents: context.pendingSpawnRequests[0]?.agents ?? [],
          modelId: context.modelId,
          cooldownMs: context.cooldownMs,
          runSubAgent: runSingleSubAgent,
        }),
        onDone: {
          target: "savingMessages",
          actions: assign({
            assistantContent: ({ context, event }) => {
              const results = event.output as SubAgentResult[];
              const toolCallId = context.pendingSpawnRequests[0]?.toolCallId ?? "";
              return [
                ...context.assistantContent,
                {
                  type: "tool-result" as const,
                  toolCallId,
                  toolName: "spawn_agents",
                  output: {
                    type: "json" as const,
                    value: { results },
                  },
                },
              ];
            },
            subAgentResults: ({ event }) => event.output as SubAgentResult[],
            shouldContinue: () => true,
            pendingSpawnRequests: () => [],
          }),
        },
        onError: {
          target: "savingMessages",
          actions: assign({
            assistantContent: ({ context }) => {
              const toolCallId = context.pendingSpawnRequests[0]?.toolCallId ?? "";
              return [
                ...context.assistantContent,
                {
                  type: "tool-result" as const,
                  toolCallId,
                  toolName: "spawn_agents",
                  output: {
                    type: "error-json" as const,
                    value: { success: false, error: "Sub-agent execution failed" },
                  },
                },
              ];
            },
            shouldContinue: () => true,
            pendingSpawnRequests: () => [],
          }),
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
            target: "completed",
            guard: "calledCompleteTool",
            actions: ["logComplete"],
          },
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
      entry: () => {
        Logger.info("Agent completed successfully");
      },
    },

    failed: {
      type: "final",
      entry: ({ context }) => {
        Logger.error("Agent failed", {
          extra: { error: context.error?.message },
        });
      },
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
