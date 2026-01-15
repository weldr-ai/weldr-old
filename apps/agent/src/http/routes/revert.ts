import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { auth } from "@/core/auth";
import { Git } from "@/core/git";
import { createSnapshotService, syncFromCloud } from "@/core/sandbox";
import { createRouter } from "@/http/utils";

const route = createRoute({
  method: "post",
  path: "/revert",
  summary: "Revert to a previous version",
  description:
    "Revert to a previous version by copying its DB to a new version and creating a revert commit",
  tags: ["Agent"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID", example: "123abc" }),
            sourceVersionId: z.string().openapi({
              description: "Version ID to revert to (source)",
              example: "456def",
            }),
            targetVersionId: z.string().openapi({
              description: "New version ID for the revert (target)",
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
      description: "Version reverted successfully",
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
  const { projectId, sourceVersionId, targetVersionId, branchId } = c.req.valid("json");

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [project, branch, sourceVersion] = await Promise.all([
    db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    }),
    db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.projectId, projectId)),
    }),
    db.query.versions.findFirst({
      where: and(eq(versions.id, sourceVersionId), eq(versions.projectId, projectId)),
    }),
  ]);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  if (!sourceVersion) {
    return c.json({ error: "Source version not found" }, 404);
  }

  const logger = Logger.get({
    projectId,
    branchId,
    sourceVersionId,
    targetVersionId,
  });

  try {
    const snapshotService = createSnapshotService(projectId);

    // 1. Check if source version exists in cloud storage
    const sourceExists = await snapshotService.versionExists(sourceVersionId);
    if (!sourceExists) {
      return c.json({ error: "Source version does not have a snapshot in cloud storage" }, 400);
    }

    // 2. Copy source version's DB to target version
    logger.info("Copying source version to target version", {
      extra: { sourceVersionId, targetVersionId },
    });

    await snapshotService.copyVersion(sourceVersionId, targetVersionId);

    // 3. Sync target version to local
    const syncResult = await syncFromCloud(targetVersionId, projectId);
    if (!syncResult.success) {
      throw new Error("Failed to sync target version from cloud");
    }

    // 4. Create revert commit using Git
    const revertMessage = `revert: Revert to version #${sourceVersion.sequenceNumber}${
      sourceVersion.message ? ` - ${sourceVersion.message}` : ""
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
        branchId,
      );

      logger.info("Revert commit created", { extra: { commitHash } });
    } catch (error) {
      logger.warn("Failed to create git commit", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Initialize git and try again
      const hasRepo = await Git.hasGitRepository(projectId, branchId);
      if (!hasRepo) {
        await Git.initRepository(projectId, branchId);
        commitHash = await Git.commit(
          revertMessage,
          {
            name: session.user.name || "Weldr",
            email: session.user.email || "user@weldr.dev",
          },
          projectId,
          branchId,
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
        sourceVersionId,
        targetVersionId,
      },
    });
    return c.json({ error: error instanceof Error ? error.message : "Revert failed" }, 500);
  }
});

export default router;
