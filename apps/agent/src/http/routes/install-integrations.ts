import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import {
  branches,
  environmentVariables,
  integrationEnvironmentVariables,
  integrationInstallations,
  integrations,
  integrationTemplates,
  projects,
} from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import type { ChatContext } from "@/ai/agent/types";
import { auth } from "@/core/auth";
import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { installQueuedIntegrations } from "@/core/integrations/utils/queue-installer";
import { processIntegrationQueue } from "@/core/integrations/utils/queue-manager";
import { createRouter } from "@/http/utils";

const integrationInputSchema = z.object({
  name: z.string().optional(),
  integrationTemplateId: z.string(),
  environmentVariableMappings: z.array(
    z.object({
      configKey: z.string(),
      envVarId: z.string(),
    }),
  ),
});

const route = createRoute({
  method: "post",
  path: "/integrations/install",
  summary: "Setup and install integrations",
  description: "Create integration records and install them for a project",
  tags: ["Integrations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID" }),
            branchId: z.string().openapi({ description: "Branch ID" }),
            integrations: z.array(integrationInputSchema).openapi({
              description: "Integrations to setup and install",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Integrations setup started successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            integrations: z.array(
              z.object({
                id: z.string(),
                installationId: z.string(),
                key: z.string(),
                name: z.string(),
                status: z.string(),
              }),
            ),
          }),
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
    },
    404: {
      description: "Project not found",
    },
    500: {
      description: "Setup failed",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

const router = createRouter();

router.openapi(route, async (c) => {
  const { projectId, branchId, integrations: integrationsInput } = c.req.valid("json");
  const logger = Logger.get({ projectId });

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;

    // Validate project access
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
      with: {
        integrations: {
          with: {
            integrationTemplate: {
              with: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get branch and snapshot
    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
      with: {
        snapshot: true,
      },
    });

    if (!branch || !branch.snapshot) {
      logger.error("No active snapshot found", {
        extra: { projectId },
      });
      return c.json({ success: false, error: "No active snapshot found for branch" }, 500);
    }

    const snapshotId = branch.snapshot.id;

    // Create integrations, env var mappings, and installation records in a transaction
    const createdIntegrations = await db.transaction(async (tx) => {
      const results: Array<{
        id: string;
        installationId: string;
        key: string;
        name: string;
        status: "queued";
      }> = [];

      for (const integrationData of integrationsInput) {
        const { name, integrationTemplateId, environmentVariableMappings } = integrationData;

        // Check if integration already exists for this template
        const existingIntegration = await tx.query.integrations.findFirst({
          where: and(
            eq(integrations.projectId, projectId),
            eq(integrations.userId, userId),
            eq(integrations.integrationTemplateId, integrationTemplateId),
          ),
        });

        if (existingIntegration) {
          throw new Error(`Integration with template ${integrationTemplateId} already exists`);
        }

        // Get the template
        const integrationTemplate = await tx.query.integrationTemplates.findFirst({
          where: eq(integrationTemplates.id, integrationTemplateId),
        });

        if (!integrationTemplate) {
          throw new Error(`Integration template ${integrationTemplateId} not found`);
        }

        // Create the integration
        const [integration] = await tx
          .insert(integrations)
          .values({
            key: integrationTemplate.key,
            name: name ?? integrationTemplate.name,
            projectId,
            userId,
            integrationTemplateId,
            options: integrationTemplate.recommendedOptions,
          })
          .returning();

        if (!integration) {
          throw new Error("Failed to create integration");
        }

        // Create environment variable mappings
        const integrationVariables = (integrationTemplate.variables ?? []).map((v) => v.name);

        for (const mapping of environmentVariableMappings) {
          const envVar = await tx.query.environmentVariables.findFirst({
            where: eq(environmentVariables.id, mapping.envVarId),
          });

          if (!envVar) {
            throw new Error(`Environment variable ${mapping.envVarId} not found`);
          }

          const isValidVariable = integrationVariables.some(
            (variable) => variable === mapping.configKey,
          );

          if (!isValidVariable) {
            throw new Error(
              `Configuration key ${mapping.configKey} not valid for this integration`,
            );
          }

          await tx.insert(integrationEnvironmentVariables).values({
            integrationId: integration.id,
            mapTo: mapping.configKey,
            environmentVariableId: envVar.id,
          });
        }

        // Create installation record
        const [installation] = await tx
          .insert(integrationInstallations)
          .values({
            integrationId: integration.id,
            snapshotId,
            status: "queued",
          })
          .returning();

        if (!installation) {
          throw new Error("Failed to create installation record");
        }

        logger.info("Created integration and queued for installation", {
          extra: { integrationKey: integration.key, snapshotId },
        });

        results.push({
          id: integration.id,
          installationId: installation.id,
          key: integration.key,
          name: integration.name ?? integrationTemplate.name,
          status: "queued",
        });
      }

      return results;
    });

    logger.info("Integration setup completed, starting installation", {
      extra: { count: createdIntegrations.length },
    });

    // Start installation asynchronously (don't block the response)
    const installedCategories = await getInstalledCategories(snapshotId);

    const chatContext: ChatContext = {
      project: {
        ...project,
        integrationCategories: new Set(installedCategories),
      },
      branch: {
        ...branch,
        snapshot: branch.snapshot,
      },
      user: session.user,
      modelId: "google:gemini-2.5-pro",
    };

    // Fire and forget - installation happens in the background
    // Client will poll for status
    setImmediate(async () => {
      try {
        await processIntegrationQueue(chatContext);
        await installQueuedIntegrations(chatContext);
        logger.info("Background installation completed");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error("Background installation failed", {
          extra: { error: errorMessage },
        });
      }
    });

    // Return immediately with the created integration IDs
    return c.json({
      success: true,
      integrations: createdIntegrations,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Integration setup failed", {
      extra: { error: errorMessage },
    });

    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default router;
