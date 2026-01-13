import { hasToolCall, streamText, type ModelMessage, type ToolSet } from "ai";
import { fromPromise } from "xstate";

import type { AiModel } from "@weldr/db/schema";

import type { AssistantContentArray, FinishReason, PendingSpawnRequest } from "@/agent/types";
import { registry } from "@/ai/providers";
import { spawnAgentsInputSchema } from "@/ai/tools/spawn-agents";
import type { LLMUsage } from "@/core/metrics";
import { stream } from "@/core/stream";

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
  let shouldContinue = false;
  let forceContinue = false;
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
    stopWhen: [hasToolCall("add_integrations"), hasToolCall("spawn_agents")],
    onError: (error) => {
      const errorValue = error instanceof Error ? error : new Error(String(error));
      streamError = errorValue;
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
            forceContinue = true;
            break;
          }

          const agentCount = parsedInput.data.agents.length;

          if (agentCount <= input.maxSubAgents) {
            pendingSpawnRequests.push({
              toolCallId: part.toolCallId,
              agents: parsedInput.data.agents,
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
            forceContinue = true;
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
        break;
      }
      case "error": {
        const errorValue =
          part.error instanceof Error
            ? part.error
            : new Error(String(part.error ?? "LLM stream error"));
        streamError = errorValue;
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
      inputTokens: resultUsage.inputTokens ?? 0,
      outputTokens: resultUsage.outputTokens ?? 0,
      totalTokens: resultUsage.totalTokens ?? 0,
    };
  }

  if (resultFinishReason) {
    finishReason = resultFinishReason as FinishReason;
  }

  shouldContinue = forceContinue || resultFinishReason === "length";

  return {
    shouldContinue,
    assistantContent,
    usage,
    finishReason,
    pendingSpawnRequests,
  };
});

export type { LLMStreamInput, LLMStreamResult };
