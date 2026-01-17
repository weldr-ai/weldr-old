import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { environmentVariables, secrets } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";

import { protectedProcedure } from "@/lib/procedures";
import { isLocalMode } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "DELETE",
  tags: ["Environment Variables"],
  path: "/environment-variables/:id",
  successStatus: 200,
  description: "Delete an environment variable",
  summary: "Delete environment variable",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ environmentVariableId: input.id, userId }, "Deleting environment variable");

    const environmentVariable = await context.db.query.environmentVariables.findFirst({
      where: and(eq(environmentVariables.id, input.id), eq(environmentVariables.userId, userId)),
      with: {
        integrations: {
          with: {
            integration: true,
          },
        },
      },
    });

    if (!environmentVariable) {
      throw new ORPCError("NOT_FOUND", { message: "Environment variable not found" });
    }

    if (environmentVariable.integrations.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: `Cannot delete environment variable because it is used by the following integrations: ${environmentVariable.integrations.map((i) => i.integration.name).join(", ")}. Please remove it from these integrations first.`,
      });
    }

    await context.db.delete(secrets).where(eq(secrets.id, environmentVariable.secretId));

    await context.db.delete(environmentVariables).where(eq(environmentVariables.id, input.id));

    if (!isLocalMode()) {
      await Promise.all([
        Fly.secret.destroy({
          type: "development",
          projectId: environmentVariable.projectId,
          secretKeys: [environmentVariable.key],
        }),
        Fly.secret.destroy({
          type: "preview",
          projectId: environmentVariable.projectId,
          secretKeys: [environmentVariable.key],
        }),
        Fly.secret.destroy({
          type: "production",
          projectId: environmentVariable.projectId,
          secretKeys: [environmentVariable.key],
        }),
      ]);
    }
  });
