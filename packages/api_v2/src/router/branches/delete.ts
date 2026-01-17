import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches } from "@weldr/db/schema";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "DELETE",
  tags: ["Branches"],
  path: "/branches/:id",
  successStatus: 200,
  description: "Delete branch (not the snapshots - they're immutable)",
  summary: "Delete branch",
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

    logger?.info({ branchId: input.id, userId }, "Deleting branch");

    const branch = await context.db.query.branches.findFirst({
      where: and(eq(branches.id, input.id), eq(branches.userId, userId)),
    });

    if (!branch) {
      throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
    }

    if (branch.name === "main") {
      throw new ORPCError("FORBIDDEN", { message: "Cannot delete main branch" });
    }

    await context.db.delete(branches).where(eq(branches.id, input.id));

    return { success: true };
  });
