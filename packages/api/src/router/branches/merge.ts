import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq, inArray } from "@weldr/db";
import { branches, snapshotParents, snapshots } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "POST",
  tags: ["Branches"],
  path: "/branches/:id/merge",
  successStatus: 200,
  description: "Merge multiple branches into target",
  summary: "Merge branches",
} satisfies Route;

const inputSchema = z.object({
  id: z.string(),
  sourceBranchIds: z.array(z.string()),
  commitSha: z.string(),
  title: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info(
      { targetBranchId: input.id, sourceBranchIds: input.sourceBranchIds, userId },
      "Merging branches",
    );

    const targetBranch = await context.db.query.branches.findFirst({
      where: and(eq(branches.id, input.id), eq(branches.userId, userId)),
    });

    if (!targetBranch) {
      throw new ORPCError("NOT_FOUND", { message: "Target branch not found" });
    }

    const sourceBranches = await context.db.query.branches.findMany({
      where: and(
        inArray(branches.id, input.sourceBranchIds),
        eq(branches.projectId, targetBranch.projectId),
      ),
    });

    const parentIds: string[] = sourceBranches
      .map((b) => b.snapshotId)
      .filter((id): id is string => id !== null);

    if (targetBranch.snapshotId) {
      parentIds.push(targetBranch.snapshotId);
    }

    const snapshotId = nanoid();

    await context.db.transaction(async (tx) => {
      await tx.insert(snapshots).values({
        id: snapshotId,
        projectId: targetBranch.projectId,
        userId,
        commitSha: input.commitSha,
        title: input.title,
        createdBy: userId,
      });

      if (parentIds.length > 0) {
        await tx.insert(snapshotParents).values(
          parentIds.map((parentId) => ({
            snapshotId,
            parentId,
          })),
        );
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
