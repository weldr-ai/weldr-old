import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { declarations } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Declarations"],
  path: "/declarations/:id",
  successStatus: 200,
  description: "Get declaration by ID",
  summary: "Get declaration",
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

    logger?.info({ declarationId: input.id, userId }, "Getting declaration");

    const declaration = await context.db.query.declarations.findFirst({
      where: and(eq(declarations.id, input.id), eq(declarations.userId, userId)),
      columns: {
        id: true,
        nodeId: true,
        metadata: true,
        progress: true,
      },
      with: {
        node: {
          columns: {
            userId: false,
          },
        },
      },
    });

    if (!declaration) {
      throw new ORPCError("NOT_FOUND", { message: "Declaration not found" });
    }

    return declaration;
  });
