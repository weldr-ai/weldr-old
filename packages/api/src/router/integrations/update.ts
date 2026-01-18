import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { and, eq } from "@weldr/db";
import {
  environmentVariables,
  integrationEnvironmentVariables,
  integrations,
} from "@weldr/db/schema";
import { updateIntegrationSchema } from "@weldr/shared/validators/integrations";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Integrations"],
  path: "/integrations/:id",
  successStatus: 200,
  description: "Update integration",
  summary: "Update integration",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(updateIntegrationSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ integrationId: input.where.id, userId }, "Updating integration");

    return await context.db.transaction(async (tx) => {
      const existingIntegration = await tx.query.integrations.findFirst({
        where: and(eq(integrations.id, input.where.id), eq(integrations.userId, userId)),
      });

      if (!existingIntegration) {
        throw new ORPCError("NOT_FOUND", { message: "Integration not found" });
      }

      const [updatedIntegration] = await tx
        .update(integrations)
        .set({
          name: input.payload.name ?? existingIntegration.name,
        })
        .where(eq(integrations.id, input.where.id))
        .returning();

      if (!updatedIntegration) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to update integration" });
      }

      if (input.payload.environmentVariableMappings) {
        for (const mapping of input.payload.environmentVariableMappings) {
          const envVarKey = await tx.query.environmentVariables.findFirst({
            where: eq(environmentVariables.id, mapping.envVarId),
          });

          if (!envVarKey) {
            logger?.error(
              { integrationId: input.where.id, envVarId: mapping.envVarId },
              "Failed to find environment variable",
            );
            throw new ORPCError("NOT_FOUND", { message: "Failed to update integration" });
          }

          await tx
            .insert(integrationEnvironmentVariables)
            .values({
              mapTo: mapping.configKey,
              environmentVariableId: envVarKey.id,
              integrationId: input.where.id,
            })
            .onConflictDoUpdate({
              target: [
                integrationEnvironmentVariables.integrationId,
                integrationEnvironmentVariables.environmentVariableId,
                integrationEnvironmentVariables.mapTo,
              ],
              set: {
                mapTo: mapping.configKey,
              },
            });
        }
      }

      return updatedIntegration;
    });
  });
