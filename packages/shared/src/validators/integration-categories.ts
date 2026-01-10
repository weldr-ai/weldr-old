import { z } from "zod";

export const integrationCategoryKeySchema = z.enum([
  "backend",
  "frontend",
  "database",
  "authentication",
]);

const baseIntegrationCategorySchema = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.number().int().min(0).max(100).default(100),
});

export const backendIntegrationCategorySchema = baseIntegrationCategorySchema.extend({
  key: z.literal("backend"),
  recommendedIntegrations: z.tuple([z.literal("orpc")]),
  dependencies: z.null(),
});

export const frontendIntegrationCategorySchema = baseIntegrationCategorySchema.extend({
  key: z.literal("frontend"),
  recommendedIntegrations: z.tuple([z.literal("tanstack-start")]),
  dependencies: z.null(),
});

export const databaseIntegrationCategorySchema = baseIntegrationCategorySchema.extend({
  key: z.literal("database"),
  recommendedIntegrations: z.tuple([z.literal("postgresql")]),
  dependencies: z.tuple([z.literal("backend")]),
});

export const authenticationIntegrationCategorySchema = baseIntegrationCategorySchema.extend({
  key: z.literal("authentication"),
  recommendedIntegrations: z.tuple([z.literal("better-auth")]),
  dependencies: z.tuple([z.literal("backend"), z.literal("database")]),
});

export const integrationCategorySchema = z.discriminatedUnion("key", [
  backendIntegrationCategorySchema,
  frontendIntegrationCategorySchema,
  databaseIntegrationCategorySchema,
  authenticationIntegrationCategorySchema,
]);
