import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects, snapshots } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { auth } from "@/core/auth";
import { Git } from "@/core/git";
import { createSnapshotService, syncFromCloud } from "@/core/workspace";
import { createRouter } from "@/http/utils";

const route = createRoute({
  method: "post",
  path: "/revert",
  summary: "Revert to a previous snapshot",
  description:
    "Revert to a previous snapshot by copying its DB to a new snapshot and creating a revert commit",
  tags: ["Agent"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID", example: "123abc" }),
            sourceSnapshotId: z.string().openapi({
              description: "Snapshot ID to revert to (source)",
              example: "456def",
            }),
            targetSnapshotId: z.string().openapi({
              description: "New snapshot ID for the revert (target)",
              example: "789ghi",
            }),
            branchId: z.string().openapi({ description: "Branch ID", example: "abc123" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Snapshot reverted successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            commitHash: z.string(),
          }),
        },
      },
    },
    400: {
      description: "Bad request",
    },
    401: {
      description: "Unauthorized",
    },
    404: {
      description: "Not found",
    },
  },
});

const router = createRouter();

router.openapi(route, async (c) => {
  const { projectId, sourceSnapshotId, targetSnapshotId, branchId } = c.req.valid("json");

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [project, branch, sourceSnapshot] = await Promise.all([
    db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    }),
    db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.projectId, projectId)),
    }),
    db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, sourceSnapshotId), eq(snapshots.projectId, projectId)),
    }),
  ]);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  if (!sourceSnapshot) {
    return c.json({ error: "Source snapshot not found" }, 404);
  }

  const logger = Logger.get({
    projectId,
    branchId,
    sourceSnapshotId,
    targetSnapshotId,
  });

  try {
    const snapshotService = createSnapshotService(projectId);

    // 1. Check if source snapshot exists in cloud storage
    const sourceExists = await snapshotService.snapshotExists(sourceSnapshotId);
    if (!sourceExists) {
      return c.json({ error: "Source snapshot does not exist in cloud storage" }, 400);
    }

    // 2. Copy source snapshot's DB to target snapshot
    logger.info("Copying source snapshot to target snapshot", {
      extra: { sourceSnapshotId, targetSnapshotId },
    });

    await snapshotService.copySnapshot(sourceSnapshotId, targetSnapshotId);

    // 3. Sync target snapshot to local
    const syncResult = await syncFromCloud(targetSnapshotId, projectId);
    if (!syncResult.success) {
      throw new Error("Failed to sync target snapshot from cloud");
    }

    // 4. Create revert commit using Git
    const revertMessage = `revert: Revert to snapshot${
      sourceSnapshot.title ? ` - ${sourceSnapshot.title}` : ` ${sourceSnapshot.id.slice(0, 8)}`
    }`;

    let commitHash: string;
    try {
      commitHash = await Git.commit(
        revertMessage,
        {
          name: session.user.name || "Weldr",
          email: session.user.email || "user@weldr.dev",
        },
        projectId,
        targetSnapshotId,
      );

      logger.info("Revert commit created", { extra: { commitHash } });
    } catch (error) {
      logger.warn("Failed to create git commit", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Initialize git and try again
      const hasRepo = await Git.hasGitRepository(projectId, targetSnapshotId);
      if (!hasRepo) {
        await Git.initRepository(projectId, targetSnapshotId);
        commitHash = await Git.commit(
          revertMessage,
          {
            name: session.user.name || "Weldr",
            email: session.user.email || "user@weldr.dev",
          },
          projectId,
          targetSnapshotId,
        );
      } else {
        throw error;
      }
    }

    return c.json({
      success: true,
      commitHash,
    });
  } catch (error) {
    logger.error("Revert failed", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        branchId,
        sourceSnapshotId,
        targetSnapshotId,
      },
    });
    return c.json({ error: error instanceof Error ? error.message : "Revert failed" }, 500);
  }
});

export default router;
