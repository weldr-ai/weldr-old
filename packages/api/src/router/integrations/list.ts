import type { Route } from "@orpc/server";
import { z } from "zod";

import { and, desc, eq } from "@weldr/db";
import { integrations } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Integrations"],
  path: "/integrations",
  successStatus: 200,
  description: "List integrations for a project",
  summary: "List integrations",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    return await context.db.query.integrations.findMany({
      where: and(
        eq(integrations.projectId, input.projectId),
        eq(integrations.userId, context.user.id),
      ),
      columns: {
        id: true,
        name: true,
        key: true,
      },
      with: {
        environmentVariableMappings: {
          columns: {
            environmentVariableId: true,
            mapTo: true,
          },
        },
        integrationTemplate: {
          columns: {
            id: true,
            name: true,
            description: true,
            key: true,
            variables: true,
          },
        },
      },
      orderBy: desc(integrations.id),
    });
  });
