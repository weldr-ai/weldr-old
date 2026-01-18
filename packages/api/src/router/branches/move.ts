import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches, snapshots } from "@weldr/db/schema";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Branches"],
  path: "/branches/:id/move",
  successStatus: 200,
  description: "Move branch to a different snapshot",
  summary: "Move branch",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  snapshotId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ branchId: input.id, snapshotId: input.snapshotId, userId }, "Moving branch");

    const branch = await context.db.query.branches.findFirst({
      where: and(eq(branches.id, input.id), eq(branches.userId, userId)),
    });

    if (!branch) {
      throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
    }

    const snapshot = await context.db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, input.snapshotId), eq(snapshots.projectId, branch.projectId)),
    });

    if (!snapshot) {
      throw new ORPCError("NOT_FOUND", { message: "Snapshot not found" });
    }

    await context.db
      .update(branches)
      .set({
        snapshotId: input.snapshotId,
        updatedAt: new Date(),
      })
      .where(eq(branches.id, input.id));

    return { success: true };
  });
