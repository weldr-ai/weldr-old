import { z } from "zod";

const baseIntegrationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const orpcIntegrationTemplateSchema = baseIntegrationTemplateSchema.extend({
  key: z.literal("orpc"),
  allowMultiple: z.literal(false),
  variables: z.null(),
  options: z.null(),
  recommendedOptions: z.null(),
  isRecommended: z.literal(true),
});

export const tanstackStartIntegrationTemplateSchema = baseIntegrationTemplateSchema.extend({
  key: z.literal("tanstack-start"),
  allowMultiple: z.literal(false),
  variables: z.null(),
  options: z.null(),
  recommendedOptions: z.null(),
  isRecommended: z.literal(true),
});

export const postgresqlIntegrationTemplateSchema = baseIntegrationTemplateSchema.extend({
  key: z.literal("postgresql"),
  allowMultiple: z.literal(false),
  variables: z.tuple([
    z.object({
      name: z.literal("DATABASE_URL"),
      isRequired: z.literal(true),
      source: z.literal("user"),
      target: z.tuple([z.literal("server")]),
    }),
  ]),
  options: z.object({
    orm: z.tuple([z.literal("drizzle")]),
  }),
  recommendedOptions: z.object({
    orm: z.literal("drizzle"),
  }),
  isRecommended: z.literal(true),
});

export const betterAuthIntegrationTemplateSchema = baseIntegrationTemplateSchema.extend({
  key: z.literal("better-auth"),
  variables: z.array(
    z.object({
      name: z.literal("BETTER_AUTH_SECRET"),
      isRequired: z.literal(true),
      source: z.literal("system"),
      target: z.tuple([z.literal("server")]),
    }),
  ),
  allowMultiple: z.literal(false),
  options: z.object({
    socialProviders: z.tuple([z.literal("github"), z.literal("google"), z.literal("microsoft")]),
    plugins: z.tuple([
      z.literal("admin"),
      z.literal("oAuthProxy"),
      z.literal("openAPI"),
      z.literal("organization"),
      z.literal("stripe"),
    ]),
    emailVerification: z.boolean().default(false),
    emailAndPassword: z.boolean().default(true),
    stripeIntegration: z.boolean().default(false),
  }),
  recommendedOptions: z.null(),
  isRecommended: z.literal(true),
});

export const integrationTemplateSchema = z.discriminatedUnion("key", [
  orpcIntegrationTemplateSchema,
  tanstackStartIntegrationTemplateSchema,
  postgresqlIntegrationTemplateSchema,
  betterAuthIntegrationTemplateSchema,
]);
