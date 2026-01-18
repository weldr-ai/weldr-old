import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { nodes } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Nodes"],
  path: "/nodes/:id",
  successStatus: 200,
  description: "Get node by ID",
  summary: "Get node",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ nodeId: input.id, userId }, "Getting node");

    const canvasNode = await context.db.query.nodes.findFirst({
      where: and(eq(nodes.id, input.id), eq(nodes.userId, userId)),
    });

    if (!canvasNode) {
      throw new ORPCError("NOT_FOUND", { message: "Canvas node not found" });
    }

    return canvasNode;
  });
