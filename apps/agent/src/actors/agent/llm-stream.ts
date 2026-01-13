import { streamText, type ModelMessage, type ToolSet } from "ai";
import { fromPromise } from "xstate";

import type { AiModel } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import {
  type AssistantContentArray,
  type FinishReason,
  type LLMUsage,
  type PendingSpawnRequest,
} from "@/actors/agent/types";
import { spawnAgentsInputSchema } from "@/ai/tools/spawn-agent";
import { registry } from "@/ai/utils/registry";
import { stream } from "@/lib/stream-utils";

type LLMStreamInput = {
  messages: ModelMessage[];
  tools: ToolSet;
  activeTools: string[] | undefined;
  systemPrompt: string;
  modelId: AiModel;
  chatId: string;
  messageId: string;
  maxSubAgents: number;
};

type LLMStreamResult = {
  shouldContinue: boolean;
  assistantContent: AssistantContentArray;
  usage: LLMUsage | null;
  finishReason: FinishReason | null;
  pendingSpawnRequests: PendingSpawnRequest[];
};

export const llmStreamActor = fromPromise<LLMStreamResult, LLMStreamInput>(async ({ input }) => {
  const logger = Logger.get({ chatId: input.chatId });

  let shouldContinue = false;
  const pendingSpawnRequests: PendingSpawnRequest[] = [];
  const assistantContent: AssistantContentArray = [];
  let usage: LLMUsage | null = null;
  let finishReason: FinishReason | null = null;
  let streamError: Error | null = null;

  const result = streamText({
    model: registry.languageModel(input.modelId),
    system: input.systemPrompt,
    tools: input.tools,
    experimental_activeTools: input.activeTools,
    messages: input.messages,
    onError: (error) => {
      const errorValue = error instanceof Error ? error : new Error(String(error));
      streamError = errorValue;
      logger.error("Error in LLM stream", { extra: { error: errorValue.message } });
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        await stream(input.chatId, {
          id: input.messageId,
          type: "text",
          text: part.text,
        });

        const lastItem = assistantContent[assistantContent.length - 1];
        if (lastItem && lastItem.type === "text") {
          lastItem.text += part.text;
        } else {
          assistantContent.push({ type: "text", text: part.text });
        }
        break;
      }
      case "reasoning-delta": {
        await stream(input.chatId, {
          id: input.messageId,
          type: "reasoning",
          text: part.text,
        });

        const lastItem = assistantContent[assistantContent.length - 1];
        if (lastItem && lastItem.type === "reasoning") {
          lastItem.text += part.text;
        } else {
          assistantContent.push({ type: "reasoning", text: part.text, providerOptions: {} });
        }
        break;
      }
      case "tool-call": {
        assistantContent.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });

        if (part.toolName === "spawn_agents") {
          const parsedInput = spawnAgentsInputSchema.safeParse(part.input);

          if (!parsedInput.success) {
            assistantContent.push({
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: {
                type: "error-text" as const,
                value: "Invalid spawn_agents input.",
              },
            });
            logger.warn("spawn_agents input validation failed", {
              extra: { toolCallId: part.toolCallId, issues: parsedInput.error.issues },
            });
            shouldContinue = true;
            break;
          }

          const agentCount = parsedInput.data.agents.length;

          if (agentCount <= input.maxSubAgents) {
            pendingSpawnRequests.push({
              toolCallId: part.toolCallId,
              agents: parsedInput.data.agents,
            });
            logger.info("spawn_agents tool call detected, will spawn sub-agents", {
              extra: { toolCallId: part.toolCallId, agentCount },
            });
          } else {
            assistantContent.push({
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: {
                type: "error-text" as const,
                value: `Cannot spawn ${agentCount} agents. Maximum allowed is ${input.maxSubAgents}.`,
              },
            });
            logger.warn("spawn_agents limit exceeded, rejecting spawn request", {
              extra: { requested: agentCount, maxSubAgents: input.maxSubAgents },
            });
            shouldContinue = true;
          }
        }
        break;
      }
      case "tool-result": {
        assistantContent.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        });

        shouldContinue = true;
        break;
      }
      case "error": {
        const errorValue =
          part.error instanceof Error
            ? part.error
            : new Error(String(part.error ?? "LLM stream error"));
        streamError = errorValue;
        logger.error("LLM stream error received", {
          extra: { error: errorValue.message },
        });
        shouldContinue = true;
        break;
      }
    }
  }

  if (streamError) {
    throw streamError;
  }

  const resultUsage = await result.usage;
  const resultFinishReason = await result.finishReason;

  if (resultUsage) {
    usage = {
      inputTokens: resultUsage.inputTokens,
      outputTokens: resultUsage.outputTokens,
      totalTokens: resultUsage.totalTokens,
    };
  }

  if (resultFinishReason) {
    finishReason = resultFinishReason as FinishReason;
    if (resultFinishReason === "length") {
      shouldContinue = true;
    }
  }

  return {
    shouldContinue,
    assistantContent,
    usage,
    finishReason,
    pendingSpawnRequests,
  };
});

export type { LLMStreamInput, LLMStreamResult };
