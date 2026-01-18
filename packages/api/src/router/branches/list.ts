import type { Route } from "@orpc/server";
import { z } from "zod";

import { and, desc, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Branches"],
  path: "/branches",
  successStatus: 200,
  description: "List branches for a project",
  summary: "List branches",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    return await context.db.query.branches.findMany({
      where: and(eq(branches.projectId, input.projectId), eq(branches.userId, context.user.id)),
      with: {
        snapshot: true,
      },
      orderBy: [desc(branches.updatedAt)],
    });
  });
