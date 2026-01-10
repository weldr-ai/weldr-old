import { integer, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { nanoid } from "@weldr/shared/nanoid";

export type AiModelProvider = "google" | "openai" | "anthropic";

export type GoogleModelKey = "gemini-2.5-pro" | "gemini-2.5-flash";
export type OpenAIModelKey = "gpt-4.1" | "gpt-4.1-mini" | "gpt-image-1";
export type AnthropicModelKey = "claude-sonnet-4" | "claude-opus-4";
export type AiModelKey = GoogleModelKey | OpenAIModelKey | AnthropicModelKey;

export type AiModel =
  | `google:${GoogleModelKey}`
  | `openai:${OpenAIModelKey}`
  | `anthropic:${AnthropicModelKey}`;

export const aiModels = pgTable(
  "ai_models",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    provider: text("provider").$type<AiModelProvider>().notNull(),
    modelKey: text("model_key").$type<AiModelKey>().notNull(),
    inputTokensPrice: numeric("input_tokens_price", {
      precision: 10,
      scale: 3,
    }).notNull(), // Price per 1M input tokens
    outputTokensPrice: numeric("output_tokens_price", {
      precision: 10,
      scale: 3,
    }).notNull(), // Price per 1M output tokens
    inputImagesPrice: numeric("input_images_price", {
      precision: 10,
      scale: 3,
    }), // Price per 1000 input images
    contextWindow: integer("context_window").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("unique_provider_model").on(t.provider, t.modelKey)],
);
