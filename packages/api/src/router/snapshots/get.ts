import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Snapshots"],
  path: "/snapshots/:id",
  successStatus: 200,
  description: "Get snapshot by ID",
  summary: "Get snapshot",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const snapshot = await context.db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, input.id), eq(snapshots.userId, context.user.id)),
      with: {
        parentEdges: {
          with: {
            parent: true,
          },
        },
        project: true,
        creator: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!snapshot) {
      throw new ORPCError("NOT_FOUND", { message: "Snapshot not found" });
    }

    return snapshot;
  });
