import { z } from "zod";

import { environmentVariableSchema } from "./environment-variables";

export const integrationKeySchema = z.enum(["orpc", "tanstack-start", "postgresql", "better-auth"]);

export const integrationInstallationStatusSchema = z.enum([
  "queued",
  "blocked",
  "installing",
  "installed",
  "cancelled",
  "failed",
]);

const baseIntegrationSchema = z.object({
  id: z.string(),
  key: integrationKeySchema,
  name: z.string().optional(),
  createdAt: z.date(),
  projectId: z.string(),
  userId: z.string(),
  integrationTemplateId: z.string(),
  environmentVariableMappings: z.array(
    z.object({
      integrationId: z.string(),
      mapTo: z.string(),
      environmentVariableId: z.string(),
      environmentVariable: environmentVariableSchema,
    }),
  ),
});

export const honoIntegrationSchema = baseIntegrationSchema.extend({
  key: z.literal("orpc"),
  options: z.null(),
});

export const tanstackStartIntegrationSchema = baseIntegrationSchema.extend({
  key: z.literal("tanstack-start"),
  options: z.null(),
});

export const postgresqlIntegrationSchema = baseIntegrationSchema.extend({
  key: z.literal("postgresql"),
  options: z.object({
    orm: z.enum(["drizzle", "prisma"]).default("drizzle"),
  }),
});

export const betterAuthIntegrationSchema = baseIntegrationSchema.extend({
  key: z.literal("better-auth"),
  options: z.object({
    socialProviders: z.enum(["github", "google", "microsoft"]).array(),
    plugins: z.enum(["admin", "oAuthProxy", "openAPI", "organization", "stripe"]).array(),
    emailVerifiion: z.boolean().default(false),
    emailAndPassword: z.boolean().default(true),
    stripeIntegration: z.boolean().default(false),
  }),
});

export const integrationSchema = z.discriminatedUnion("key", [
  honoIntegrationSchema,
  tanstackStartIntegrationSchema,
  postgresqlIntegrationSchema,
  betterAuthIntegrationSchema,
]);

export const integrationEnvironmentVariableMappingSchema = z.object({
  envVarId: z.string(),
  configKey: z.string(),
});

export const createIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  projectId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  integrationTemplateId: z.string().min(1),
  environmentVariableMappings: z.array(integrationEnvironmentVariableMappingSchema),
});

export const updateIntegrationSchema = z.object({
  where: z.object({
    id: z.string().min(1),
  }),
  payload: z.object({
    name: z.string().min(1).optional(),
    environmentVariableMappings: z.array(integrationEnvironmentVariableMappingSchema).optional(),
  }),
});

export const createBatchIntegrationsSchema = z.object({
  projectId: z.string().min(1),
  branchId: z.string().min(1).optional(),
  triggerWorkflow: z.boolean().optional().default(false),
  integrations: z
    .array(
      z.object({
        name: z.string().min(1).optional(),
        integrationTemplateId: z.string().min(1),
        environmentVariableMappings: z.array(integrationEnvironmentVariableMappingSchema),
      }),
    )
    .min(1),
});

export const integrationInstallationSchema = z.object({
  id: z.string(),
  integrationId: z.string(),
  versionId: z.string(),
  status: integrationInstallationStatusSchema,
  installedAt: z.date().nullable(),
  installationMetadata: z
    .object({
      filesCreated: z.array(z.string()).optional(),
      packagesInstalled: z.array(z.string()).optional(),
      declarationsAdded: z.array(z.string()).optional(),
      error: z.string().optional(),
    })
    .nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

export const createIntegrationInstallationSchema = z.object({
  integrationId: z.string().min(1),
  versionId: z.string().min(1),
  status: integrationInstallationStatusSchema.optional().default("installing"),
  installationMetadata: z
    .object({
      filesCreated: z.array(z.string()).optional(),
      packagesInstalled: z.array(z.string()).optional(),
      declarationsAdded: z.array(z.string()).optional(),
      error: z.string().optional(),
    })
    .optional(),
});

export const updateIntegrationInstallationSchema = z.object({
  where: z.object({
    id: z.string().min(1),
  }),
  payload: z.object({
    status: integrationInstallationStatusSchema.optional(),
    installedAt: z.date().optional(),
    installationMetadata: z
      .object({
        filesCreated: z.array(z.string()).optional(),
        packagesInstalled: z.array(z.string()).optional(),
        declarationsAdded: z.array(z.string()).optional(),
        error: z.string().optional(),
      })
      .optional(),
  }),
});
