import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { and, eq } from "@weldr/db";
import {
  branches,
  environmentVariables,
  integrationEnvironmentVariables,
  integrationInstallations,
  integrations,
  integrationTemplates,
  projects,
} from "@weldr/db/schema";
import { createIntegrationSchema } from "@weldr/shared/validators/integrations";

import { protectedProcedure } from "@/lib/procedures";
import { callAgentProxy } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Integrations"],
  path: "/integrations",
  successStatus: 201,
  description: "Create a new integration",
  summary: "Create integration",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(createIntegrationSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ projectId: input.projectId, userId }, "Creating integration");

    const result = await context.db.transaction(async (tx) => {
      const { name, projectId, integrationTemplateId, environmentVariableMappings } = input;

      const project = await tx.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
        columns: { id: true },
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      const doesIntegrationExist = await tx.query.integrations.findFirst({
        where: and(
          eq(integrations.projectId, projectId),
          eq(integrations.userId, userId),
          eq(integrations.integrationTemplateId, integrationTemplateId),
        ),
      });

      if (doesIntegrationExist) {
        throw new ORPCError("BAD_REQUEST", { message: "Integration already exists" });
      }

      const integrationTemplate = await tx.query.integrationTemplates.findFirst({
        where: eq(integrationTemplates.id, integrationTemplateId),
      });

      if (!integrationTemplate) {
        logger?.error({ projectId, integrationTemplateId }, "Failed to find integration template");
        throw new ORPCError("NOT_FOUND", { message: "Failed to create integration" });
      }

      const [integration] = await tx
        .insert(integrations)
        .values({
          key: integrationTemplate.key,
          name,
          projectId,
          userId,
          integrationTemplateId,
          options: integrationTemplate.recommendedOptions,
        })
        .returning();

      if (!integration) {
        logger?.error({ projectId }, "Failed to create integration");
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create integration" });
      }

      const integrationVariables = (integrationTemplate.variables ?? []).map((v) => v.name);

      for (const mapping of environmentVariableMappings) {
        const envVarKey = await tx.query.environmentVariables.findFirst({
          where: eq(environmentVariables.id, mapping.envVarId),
        });

        if (!envVarKey) {
          logger?.error(
            { projectId, envVarId: mapping.envVarId },
            "Failed to find environment variable",
          );
          throw new ORPCError("NOT_FOUND", { message: "Failed to create integration" });
        }

        if (
          !integrationVariables.includes(envVarKey.key as (typeof integrationVariables)[number])
        ) {
          logger?.error({ projectId }, "Environment variable not in config");
          throw new ORPCError("BAD_REQUEST", { message: "Failed to create integration" });
        }

        await tx.insert(integrationEnvironmentVariables).values({
          integrationId: integration.id,
          mapTo: mapping.configKey,
          environmentVariableId: envVarKey.id,
        });
      }

      if (input.branchId) {
        const branch = await tx.query.branches.findFirst({
          where: and(eq(branches.id, input.branchId), eq(branches.projectId, projectId)),
        });

        if (branch?.snapshotId) {
          await tx.insert(integrationInstallations).values({
            integrationId: integration.id,
            snapshotId: branch.snapshotId,
            status: "queued",
          });

          logger?.info(
            { projectId, integrationKey: integration.key, snapshotId: branch.snapshotId },
            "Queued integration for snapshot",
          );
        } else {
          logger?.warn({ projectId, branchId: input.branchId }, "Branch has no snapshot");
        }
      }

      return integration;
    });

    if (input.branchId) {
      try {
        await callAgentProxy(
          "/integrations/install",
          {
            projectId: input.projectId,
            branchId: input.branchId,
            startSession: false,
          },
          context.reqHeaders,
        );

        logger?.info({ projectId: input.projectId }, "Installation triggered successfully");
      } catch (error) {
        logger?.error({ error, projectId: input.projectId }, "Failed to trigger installation");
      }
    }

    return result;
  });
