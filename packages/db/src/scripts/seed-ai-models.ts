import { fileURLToPath } from "node:url";

import { db } from "..";
import { aiModels } from "../schema";

/**
 * Seed data for AI models pricing
 */
const AI_MODELS_SEED_DATA: (typeof aiModels.$inferInsert)[] = [
  // Google Models
  {
    provider: "google",
    modelKey: "gemini-2.5-flash",
    inputTokensPrice: "0.30",
    outputTokensPrice: "2.50",
    inputImagesPrice: "1.238",
    contextWindow: 1_048_576,
  },
  {
    provider: "google",
    modelKey: "gemini-2.5-pro",
    inputTokensPrice: "1.25",
    outputTokensPrice: "10",
    inputImagesPrice: "5.16",
    contextWindow: 1_048_576,
  },
  // Anthropic Models
  {
    provider: "anthropic",
    modelKey: "claude-sonnet-4",
    inputTokensPrice: "3",
    outputTokensPrice: "15",
    inputImagesPrice: "4.80",
    contextWindow: 200_000,
  },
  {
    provider: "anthropic",
    modelKey: "claude-opus-4",
    inputTokensPrice: "15",
    outputTokensPrice: "75",
    inputImagesPrice: "24",
    contextWindow: 200_000,
  },
  // OpenAI Models
  {
    provider: "openai",
    modelKey: "gpt-4.1",
    inputTokensPrice: "2",
    outputTokensPrice: "8",
    inputImagesPrice: null,
    contextWindow: 1_047_576,
  },
];

/**
 * Seed AI models with pricing data
 */
export async function seedAiModels(): Promise<void> {
  console.log("🤖 Seeding AI models...");

  try {
    let inserted = 0;
    let updated = 0;

    for (const model of AI_MODELS_SEED_DATA) {
      const result = await db
        .insert(aiModels)
        .values(model)
        .onConflictDoUpdate({
          target: [aiModels.provider, aiModels.modelKey],
          set: {
            inputTokensPrice: model.inputTokensPrice,
            inputImagesPrice: model.inputImagesPrice,
            outputTokensPrice: model.outputTokensPrice,
            contextWindow: model.contextWindow,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: aiModels.id,
          provider: aiModels.provider,
          modelKey: aiModels.modelKey,
        });

      if (result.length > 0) {
        // Check if this was an insert or update by checking if createdAt === updatedAt
        const insertedModel = await db.query.aiModels.findFirst({
          where: (models, { eq, and }) =>
            and(eq(models.provider, model.provider), eq(models.modelKey, model.modelKey)),
        });

        if (insertedModel) {
          const isNewRecord =
            insertedModel.createdAt.getTime() === insertedModel.updatedAt.getTime();
          if (isNewRecord) {
            inserted++;
            console.log(`  ✅ Inserted: ${model.provider}/${model.modelKey}`);
          } else {
            updated++;
            console.log(`  🔄 Updated: ${model.provider}/${model.modelKey}`);
          }
        }
      }
    }

    console.log(`🤖 AI models seeding completed: ${inserted} inserted, ${updated} updated`);
  } catch (error) {
    console.error("❌ Error seeding AI models:", error);
    throw error;
  }
}

/**
 * Run seed script directly if called
 */
async function main() {
  await seedAiModels();
  console.log("✅ AI models seed completed successfully");
  process.exit(0);
}

// Run if this file is executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Error running AI models seed:", error);
    process.exit(1);
  });
}
