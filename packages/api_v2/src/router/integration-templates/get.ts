import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "@weldr/db";
import { integrationTemplates } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Integration Templates"],
  path: "/integration-templates/:id",
  successStatus: 200,
  description: "Get integration template by ID",
  summary: "Get integration template",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const integrationTemplate = await context.db.query.integrationTemplates.findFirst({
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
      throw new ORPCError("NOT_FOUND", { message: "Integration template not found" });
    }

    return integrationTemplate;
  });
