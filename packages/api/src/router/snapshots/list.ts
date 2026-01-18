import type { Route } from "@orpc/server";
import { z } from "zod";

import { and, desc, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Snapshots"],
  path: "/snapshots",
  successStatus: 200,
  description: "List snapshots for a project",
  summary: "List snapshots",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
  limit: z.number().default(50),
  offset: z.number().default(0),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    return context.db.query.snapshots.findMany({
      where: and(eq(snapshots.projectId, input.projectId), eq(snapshots.userId, context.user.id)),
      orderBy: [desc(snapshots.createdAt)],
      limit: input.limit,
      offset: input.offset,
      with: {
        parentEdges: {
          with: {
            parent: {
              columns: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });
  });
