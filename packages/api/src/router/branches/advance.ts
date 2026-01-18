import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches, snapshotParents, snapshots } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "POST",
  tags: ["Branches"],
  path: "/branches/:id/advance",
  successStatus: 200,
  description: "Advance branch (create snapshot and move branch to it)",
  summary: "Advance branch",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  commitSha: z.string(),
  title: z.string(),
  description: z.string().optional(),
  metrics: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalCost: z.number(),
    })
    .optional(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ branchId: input.id, userId }, "Advancing branch");

    const branch = await context.db.query.branches.findFirst({
      where: and(eq(branches.id, input.id), eq(branches.userId, userId)),
    });

    if (!branch) {
      throw new ORPCError("NOT_FOUND", { message: "Branch not found" });
    }

    const snapshotId = nanoid();

    await context.db.transaction(async (tx) => {
      await tx.insert(snapshots).values({
        id: snapshotId,
        projectId: branch.projectId,
        userId,
        commitSha: input.commitSha,
        title: input.title,
        description: input.description,
        inputTokens: input.metrics?.inputTokens ?? 0,
        outputTokens: input.metrics?.outputTokens ?? 0,
        totalCost: input.metrics?.totalCost ?? 0,
        createdBy: userId,
      });

      if (branch.snapshotId) {
        await tx.insert(snapshotParents).values({
          snapshotId,
          parentId: branch.snapshotId,
        });
      }

      await tx
        .update(branches)
        .set({
          snapshotId,
          updatedAt: new Date(),
        })
        .where(eq(branches.id, input.id));
    });

    return { snapshotId };
  });
