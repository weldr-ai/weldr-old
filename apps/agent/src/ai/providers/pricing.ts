import { and, db, eq } from "@weldr/db";
import { type AiModel, type AiModelKey, type AiModelProvider, aiModels } from "@weldr/db/schema";

export interface CostCalculation {
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  inputTokensPrice?: number;
  outputTokensPrice?: number;
  inputImagesPrice?: number;
}

export async function calculateModelCost(
  model: AiModel,
  inputTokens: number,
  outputTokens: number,
): Promise<CostCalculation | null> {
  const [provider, modelKey] = model.split(":") as [AiModelProvider, AiModelKey];

  if (!provider || !modelKey) {
    throw new Error("Invalid model format");
  }

  const modelResult = await db.query.aiModels.findFirst({
    where: and(eq(aiModels.provider, provider), eq(aiModels.modelKey, modelKey)),
  });

  if (!modelResult) return null;

  const inputCost = (inputTokens / 1_000_000) * Number(modelResult.inputTokensPrice);
  const outputCost = (outputTokens / 1_000_000) * Number(modelResult.outputTokensPrice);
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    inputTokensPrice: Number(modelResult.inputTokensPrice),
    outputTokensPrice: Number(modelResult.outputTokensPrice),
    inputImagesPrice: modelResult.inputImagesPrice
      ? Number(modelResult.inputImagesPrice)
      : undefined,
  };
}
