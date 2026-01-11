import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { environmentVariables, secrets } from "@weldr/db/schema";
import { Fly } from "@weldr/shared/fly";
import { insertEnvironmentVariableSchema } from "@weldr/shared/validators/environment-variables";

import { protectedProcedure } from "../init";
import { isLocalMode } from "../utils";

export const environmentVariablesRouter = {
  create: protectedProcedure
    .input(insertEnvironmentVariableSchema)
    .mutation(async ({ input, ctx }) => {
      const isUnique = await ctx.db.query.environmentVariables.findFirst({
        where: and(
          eq(environmentVariables.projectId, input.projectId),
          eq(environmentVariables.key, input.key),
        ),
      });

      if (isUnique) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Environment variable already exists",
        });
      }

      const environmentVariable = await ctx.db.transaction(async (tx) => {
        const secret = await tx
          .insert(secrets)
          .values({
            secret: input.value,
          })
          .returning()
          .then(([secret]) => secret);

        if (!secret) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Secret not found",
          });
        }

        const environmentVariable = await tx
          .insert(environmentVariables)
          .values({
            ...input,
            userId: ctx.session.user.id,
            secretId: secret.id,
          })
          .returning({
            id: environmentVariables.id,
          })
          .then(([environmentVariable]) => environmentVariable);

        return environmentVariable;
      });

      if (!environmentVariable) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment variable not found",
        });
      }

      // Only create Fly secrets in cloud mode
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
    }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.query.environmentVariables.findMany({
        where: eq(environmentVariables.projectId, input.projectId),
        columns: {
          id: true,
          key: true,
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const environmentVariable = await ctx.db.query.environmentVariables.findFirst({
        where: and(
          eq(environmentVariables.id, input.id),
          eq(environmentVariables.userId, ctx.session.user.id),
        ),
        with: {
          integrations: {
            with: {
              integration: true,
            },
          },
        },
      });

      if (!environmentVariable) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment variable not found",
        });
      }

      if (environmentVariable.integrations.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot delete environment variable because it is used by the following integrations: ${environmentVariable.integrations.map((i) => i.integration.name).join(", ")}. Please remove it from these integrations first.`,
        });
      }

      await ctx.db.delete(secrets).where(eq(secrets.id, environmentVariable.secretId));

      await ctx.db.delete(environmentVariables).where(eq(environmentVariables.id, input.id));

      // Only destroy Fly secrets in cloud mode
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
    }),
} satisfies TRPCRouterRecord;
