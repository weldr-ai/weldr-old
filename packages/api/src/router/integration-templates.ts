import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { eq } from "@weldr/db";
import { integrationTemplates } from "@weldr/db/schema";

import { createTRPCRouter, protectedProcedure } from "../init";

export const integrationTemplatesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.integrationTemplates.findMany({
      columns: {
        id: true,
        name: true,
        description: true,
        key: true,
        version: true,
        variables: true,
        options: true,
        recommendedOptions: true,
        isRecommended: true,
      },
      with: {
        category: {
          columns: {
            id: true,
            key: true,
            description: true,
            priority: true,
            recommendedIntegrations: true,
            dependencies: true,
          },
        },
      },
      orderBy: (templates, { asc }) => [asc(templates.key)],
    });
  }),
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const integrationTemplate = await ctx.db.query.integrationTemplates.findFirst({
      where: eq(integrationTemplates.id, input.id),
      columns: {
        id: true,
        name: true,
        description: true,
        key: true,
        isRecommended: true,
        version: true,
        variables: true,
        options: true,
        recommendedOptions: true,
      },
      with: {
        category: true,
      },
    });

    if (!integrationTemplate) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Integration template not found",
      });
    }

    return integrationTemplate;
  }),
});
