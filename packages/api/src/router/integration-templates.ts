import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db } from "@weldr/db";

import { createTRPCRouter, publicProcedure } from "../init";

export const integrationTemplatesRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return await db.query.integrationTemplates.findMany({
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
  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const integrationTemplate = await db.query.integrationTemplates.findFirst({
      where: (templates, { eq }) => eq(templates.id, input.id),
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
