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
import { createBatchIntegrationsSchema } from "@weldr/shared/validators/integrations";

import { protectedProcedure } from "@/lib/procedures";
import { callAgentProxy } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Integrations"],
  path: "/integrations/batch",
  successStatus: 201,
  description: "Create multiple integrations in batch",
  summary: "Create batch integrations",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(createBatchIntegrationsSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info(
      { projectId: input.projectId, count: input.integrations.length, userId },
      "Creating batch integrations",
    );

    const createdIntegrations = await context.db.transaction(async (tx) => {
      const results = [];

      const project = await tx.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, userId)),
        columns: { id: true },
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      let snapshotId: string | null = null;
      if (input.branchId) {
        const branch = await tx.query.branches.findFirst({
          where: and(eq(branches.id, input.branchId), eq(branches.projectId, input.projectId)),
        });
        snapshotId = branch?.snapshotId ?? null;

        if (!snapshotId) {
          logger?.warn(
            { projectId: input.projectId, branchId: input.branchId },
            "Branch has no snapshot",
          );
        }
      }

      for (const integrationData of input.integrations) {
        const { name, integrationTemplateId, environmentVariableMappings } = integrationData;

        const existingIntegration = await tx.query.integrations.findFirst({
          where: and(
            eq(integrations.projectId, input.projectId),
            eq(integrations.userId, userId),
            eq(integrations.integrationTemplateId, integrationTemplateId),
          ),
        });

        if (existingIntegration) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Integration with template ${integrationTemplateId} already exists`,
          });
        }

        const integrationTemplate = await tx.query.integrationTemplates.findFirst({
          where: eq(integrationTemplates.id, integrationTemplateId),
        });

        if (!integrationTemplate) {
          throw new ORPCError("NOT_FOUND", {
            message: `Integration template ${integrationTemplateId} not found`,
          });
        }

        const [integration] = await tx
          .insert(integrations)
          .values({
            key: integrationTemplate.key,
            name,
            projectId: input.projectId,
            userId,
            integrationTemplateId,
            options: integrationTemplate.recommendedOptions,
          })
          .returning();

        if (!integration) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create integration" });
        }

        const integrationVariables = (integrationTemplate.variables ?? []).map((v) => v.name);

        for (const mapping of environmentVariableMappings) {
          const envVar = await tx.query.environmentVariables.findFirst({
            where: eq(environmentVariables.id, mapping.envVarId),
          });

          if (!envVar) {
            throw new ORPCError("NOT_FOUND", {
              message: `Environment variable ${mapping.envVarId} not found`,
            });
          }

          const isValidVariable = integrationVariables.some(
            (variable) => variable === mapping.configKey,
          );

          if (!isValidVariable) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Configuration key ${mapping.configKey} not valid for this integration`,
            });
          }

          await tx.insert(integrationEnvironmentVariables).values({
            integrationId: integration.id,
            mapTo: mapping.configKey,
            environmentVariableId: envVar.id,
          });
        }

        if (snapshotId) {
          await tx.insert(integrationInstallations).values({
            integrationId: integration.id,
            snapshotId: snapshotId,
            status: "queued",
          });

          logger?.info(
            { projectId: input.projectId, integrationKey: integration.key, snapshotId },
            "Queued integration for snapshot",
          );
        }

        results.push(integration);
      }

      return results;
    });

    if (input.branchId) {
      try {
        await callAgentProxy(
          "/integrations/install",
          {
            projectId: input.projectId,
            branchId: input.branchId,
            chatId: input.chatId,
            startSession: input.startSession ?? false,
          },
          context.reqHeaders,
        );

        logger?.info({ projectId: input.projectId }, "Installation triggered successfully");
      } catch (error) {
        logger?.error({ error, projectId: input.projectId }, "Failed to trigger installation");
      }
    }

    return createdIntegrations;
  });
