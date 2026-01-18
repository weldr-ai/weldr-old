import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "@weldr/db";
import { nodes } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Nodes"],
  path: "/nodes/:id",
  successStatus: 200,
  description: "Update node position",
  summary: "Update node",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ nodeId: input.id, userId }, "Updating node");

    const existingNode = await context.db.query.nodes.findFirst({
      where: eq(nodes.id, input.id),
    });

    if (!existingNode || existingNode.userId !== userId) {
      throw new ORPCError("NOT_FOUND", { message: "Canvas node not found" });
    }

    const [canvasNode] = await context.db
      .update(nodes)
      .set({
        position: input.position,
      })
      .where(eq(nodes.id, input.id))
      .returning();

    return canvasNode;
  });
