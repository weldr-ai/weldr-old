import type { Route } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { environmentVariables } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Environment Variables"],
  path: "/environment-variables",
  successStatus: 200,
  description: "List environment variables for a project",
  summary: "List environment variables",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    return context.db.query.environmentVariables.findMany({
      where: and(
        eq(environmentVariables.projectId, input.projectId),
        eq(environmentVariables.userId, context.user.id),
      ),
      columns: {
        id: true,
        key: true,
      },
    });
  });
