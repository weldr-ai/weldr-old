import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, inArray, eq } from "@weldr/db";
import { nodes } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Nodes"],
  path: "/nodes/batch-update-positions",
  successStatus: 200,
  description: "Batch update node positions",
  summary: "Batch update node positions",
} satisfies Route;

const inputSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ updateCount: input.updates.length, userId }, "Batch updating node positions");

    const nodeIds = input.updates.map((u) => u.id);
    const existingNodes = await context.db.query.nodes.findMany({
      where: and(inArray(nodes.id, nodeIds), eq(nodes.userId, userId)),
      columns: { id: true },
    });

    if (existingNodes.length !== nodeIds.length) {
      throw new ORPCError("NOT_FOUND", { message: "One or more nodes not found" });
    }

    const results = await context.db.transaction(async (tx) => {
      const updatePromises = input.updates.map((update) =>
        tx
          .update(nodes)
          .set({ position: update.position })
          .where(eq(nodes.id, update.id))
          .returning(),
      );
      return await Promise.all(updatePromises);
    });

    return results;
  });
