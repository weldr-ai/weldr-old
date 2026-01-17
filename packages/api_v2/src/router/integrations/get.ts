import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { integrations } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Integrations"],
  path: "/integrations/:id",
  successStatus: 200,
  description: "Get integration by ID",
  summary: "Get integration",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const integration = await context.db.query.integrations.findFirst({
      where: and(eq(integrations.id, input.id), eq(integrations.userId, context.user.id)),
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
    });

    if (!integration) {
      throw new ORPCError("NOT_FOUND", { message: "Integration not found" });
    }

    return integration;
  });
