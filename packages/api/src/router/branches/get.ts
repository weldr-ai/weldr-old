import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Branches"],
  path: "/branches/:id",
  successStatus: 200,
  description: "Get branch by ID",
  summary: "Get branch",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const branch = await context.db.query.branches.findFirst({
      where: and(eq(branches.id, input.id), eq(branches.userId, context.user.id)),
      with: {
        snapshot: true,
      },
    });

    if (!branch) {
      throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
    }

    return branch;
  });
