import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { and, eq } from "@weldr/db";
import { environmentVariables, projects, secrets } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";
import { insertEnvironmentVariableSchema } from "@weldr/shared/validators/environment-variables";

import { protectedProcedure } from "@/lib/procedures";
import { isLocalMode } from "@/lib/utils";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Environment Variables"],
  path: "/environment-variables",
  successStatus: 201,
  description: "Create an environment variable",
  summary: "Create environment variable",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(insertEnvironmentVariableSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info(
      { projectId: input.projectId, key: input.key, userId },
      "Creating environment variable",
    );

    const project = await context.db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.userId, userId)),
      columns: { id: true },
    });

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const isUnique = await context.db.query.environmentVariables.findFirst({
      where: and(
        eq(environmentVariables.projectId, input.projectId),
        eq(environmentVariables.key, input.key),
      ),
    });

    if (isUnique) {
      throw new ORPCError("CONFLICT", { message: "Environment variable already exists" });
    }

    const environmentVariable = await context.db.transaction(async (tx) => {
      const secret = await tx
        .insert(secrets)
        .values({
          secret: input.value,
        })
        .returning()
        .then(([secret]) => secret);

      if (!secret) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create secret" });
      }

      const environmentVariable = await tx
        .insert(environmentVariables)
        .values({
          ...input,
          userId,
          secretId: secret.id,
        })
        .returning({
          id: environmentVariables.id,
        })
        .then(([environmentVariable]) => environmentVariable);

      return environmentVariable;
    });

    if (!environmentVariable) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create environment variable",
      });
    }

    if (!isLocalMode()) {
      await Promise.all([
        Fly.secret.create({
          type: "development",
          projectId: input.projectId,
          secrets: [{ key: input.key, value: input.value }],
        }),
        Fly.secret.create({
          type: "preview",
          projectId: input.projectId,
          secrets: [{ key: input.key, value: input.value }],
        }),
        Fly.secret.create({
          type: "production",
          projectId: input.projectId,
          secrets: [{ key: input.key, value: input.value }],
        }),
      ]);
    }

    return environmentVariable;
  });
