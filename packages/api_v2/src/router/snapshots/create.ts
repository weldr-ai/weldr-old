import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { projects, snapshotParents, snapshots } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Snapshots"],
  path: "/snapshots",
  successStatus: 201,
  description: "Create a snapshot (called by agent after work)",
  summary: "Create snapshot",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
  parentIds: z.array(z.string()),
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

    logger?.info({ projectId: input.projectId, userId }, "Creating snapshot");

    const project = await context.db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.userId, userId)),
      columns: { id: true },
    });

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const snapshotId = nanoid();

    await context.db.transaction(async (tx) => {
      await tx.insert(snapshots).values({
        id: snapshotId,
        projectId: input.projectId,
        userId,
        commitSha: input.commitSha,
        title: input.title,
        description: input.description,
        inputTokens: input.metrics?.inputTokens ?? 0,
        outputTokens: input.metrics?.outputTokens ?? 0,
        totalCost: input.metrics?.totalCost ?? 0,
        createdBy: userId,
      });

      if (input.parentIds.length > 0) {
        await tx.insert(snapshotParents).values(
          input.parentIds.map((parentId) => ({
            snapshotId,
            parentId,
          })),
        );
      }
    });

    return { id: snapshotId };
  });
