import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "POST",
  tags: ["Branches"],
  path: "/branches",
  successStatus: 201,
  description: "Create a new branch (fork from another branch or snapshot)",
  summary: "Create branch",
} satisfies Route;

const inputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  fromSnapshotId: z.string().optional(),
  fromBranchName: z.string().optional(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ projectId: input.projectId, name: input.name, userId }, "Creating branch");

    const project = await context.db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.userId, userId)),
      columns: { id: true },
    });

    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" });
    }

    const existingBranch = await context.db.query.branches.findFirst({
      where: and(eq(branches.projectId, project.id), eq(branches.name, input.name)),
    });

    if (existingBranch) {
      throw new ORPCError("CONFLICT", { message: "Branch name already exists" });
    }

    let snapshotId = input.fromSnapshotId;

    if (input.fromBranchName && !snapshotId) {
      const sourceBranch = await context.db.query.branches.findFirst({
        where: and(
          eq(branches.projectId, input.projectId),
          eq(branches.name, input.fromBranchName),
        ),
      });

      if (!sourceBranch) {
        throw new ORPCError("NOT_FOUND", { message: `Branch '${input.fromBranchName}' not found` });
      }

      snapshotId = sourceBranch.snapshotId ?? undefined;
    }

    const branchId = nanoid();
    const [branch] = await context.db
      .insert(branches)
      .values({
        id: branchId,
        projectId: input.projectId,
        userId,
        name: input.name,
        snapshotId: snapshotId ?? null,
        createdBy: userId,
      })
      .returning();

    if (!branch) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create branch" });
    }

    return branch;
  });
