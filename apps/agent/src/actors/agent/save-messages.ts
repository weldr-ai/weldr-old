import { fromPromise } from "xstate";

import type { AiModel, AiModelKey, AiModelProvider } from "@weldr/db/schema";

import type { AssistantContentArray, FinishReason, LLMUsage } from "@/actors/agent/types";
import { insertMessages } from "@/ai/utils/insert-messages";
import { calculateModelCost } from "@/ai/utils/providers-pricing";

type GoogleModel = "gemini-2.5-pro" | "gemini-2.5-flash";
type OpenAIModel = "gpt-4.1" | "gpt-image-1";
type AnthropicModel = "claude-sonnet-4" | "claude-opus-4";
type MetadataFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

type AiMetadata =
  | {
      provider: "google";
      model: GoogleModel;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      inputCost?: number;
      outputCost?: number;
      totalCost?: number;
      inputTokensPrice?: number;
      outputTokensPrice?: number;
      inputImagesPrice?: number;
      finishReason: MetadataFinishReason;
    }
  | {
      provider: "openai";
      model: OpenAIModel;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      inputCost?: number;
      outputCost?: number;
      totalCost?: number;
      inputTokensPrice?: number;
      outputTokensPrice?: number;
      inputImagesPrice?: number;
      finishReason: MetadataFinishReason;
    }
  | {
      provider: "anthropic";
      model: AnthropicModel;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      inputCost?: number;
      outputCost?: number;
      totalCost?: number;
      inputTokensPrice?: number;
      outputTokensPrice?: number;
      inputImagesPrice?: number;
      finishReason: MetadataFinishReason;
    };

type CostCalculation = {
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  inputTokensPrice?: number;
  outputTokensPrice?: number;
  inputImagesPrice?: number;
} | null;

type SaveMessagesInput = {
  chatId: string;
  userId: string;
  messageId: string;
  assistantContent: AssistantContentArray;
  modelId: AiModel;
  usage: LLMUsage | null;
  finishReason: FinishReason | null;
};

function buildMetadata(
  modelId: AiModel,
  usage: LLMUsage | null,
  cost: CostCalculation,
  finishReason: MetadataFinishReason,
): AiMetadata {
  const [provider, model] = modelId.split(":") as [AiModelProvider, AiModelKey];

  const baseMetadata = {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    inputCost: cost?.inputCost,
    outputCost: cost?.outputCost,
    totalCost: cost?.totalCost,
    inputTokensPrice: cost?.inputTokensPrice,
    outputTokensPrice: cost?.outputTokensPrice,
    inputImagesPrice: cost?.inputImagesPrice,
    finishReason,
  };

  switch (provider) {
    case "google": {
      const googleModel = model as GoogleModel;
      return { provider: "google", model: googleModel, ...baseMetadata };
    }
    case "openai": {
      const openaiModel = (model === "gpt-4.1-mini" ? "gpt-4.1" : model) as OpenAIModel;
      return { provider: "openai", model: openaiModel, ...baseMetadata };
    }
    case "anthropic": {
      const anthropicModel = model as AnthropicModel;
      return { provider: "anthropic", model: anthropicModel, ...baseMetadata };
    }
    default:
      return { provider: "google", model: "gemini-2.5-pro", ...baseMetadata };
  }
}

export const saveMessagesActor = fromPromise<void, SaveMessagesInput>(async ({ input }) => {
  const cost = await calculateModelCost(
    input.modelId,
    input.usage?.inputTokens ?? 0,
    input.usage?.outputTokens ?? 0,
  );

  const finishReason = input.finishReason ?? "unknown";

  await insertMessages({
    input: {
      chatId: input.chatId,
      userId: input.userId,
      messages: [
        {
          id: input.messageId,
          role: "assistant",
          content: input.assistantContent,
          metadata: buildMetadata(input.modelId, input.usage, cost, finishReason),
          createdAt: new Date(),
        },
      ],
    },
  });
});
