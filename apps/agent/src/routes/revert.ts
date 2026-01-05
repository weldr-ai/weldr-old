import { createRoute, z } from "@hono/zod-openapi";

import {
  createSnapshotService,
  openAgentFS,
  syncAgentFSToDisk,
} from "@weldr/agent-storage";
import { and, db, eq } from "@weldr/db";
import { branches, projects, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { auth } from "@/lib/auth";
import { Git } from "@/lib/git";
import { createRouter } from "@/lib/utils";

const route = createRoute({
  method: "post",
  path: "/revert",
  summary: "Revert to a previous version",
  description:
    "Revert to a previous version by restoring its snapshot and creating a revert commit",
  tags: ["Agent"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z
              .string()
              .openapi({ description: "Project ID", example: "123abc" }),
            versionId: z.string().openapi({
              description: "Version ID to revert to",
              example: "456def",
            }),
            branchId: z
              .string()
              .openapi({ description: "Branch ID", example: "789ghi" }),
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
            snapshotPath: z.string(),
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
  const { projectId, versionId, branchId } = c.req.valid("json");

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Validate project, branch, version
  const [project, branch, version] = await Promise.all([
    db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id),
      ),
    }),
    db.query.branches.findFirst({
      where: and(eq(branches.id, branchId), eq(branches.projectId, projectId)),
    }),
    db.query.versions.findFirst({
      where: and(
        eq(versions.id, versionId),
        eq(versions.projectId, projectId),
        eq(versions.userId, session.user.id),
      ),
    }),
  ]);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  const logger = Logger.get({
    projectId,
    branchId,
    versionId: version.id,
  });

  try {
    const branchDir = getBranchDir(projectId, branchId);

    // Check if version has a snapshot to restore
    if (!version.snapshotPath) {
      return c.json({ error: "Version does not have a snapshot" }, 400);
    }

    // 1. Restore AgentFS snapshot
    logger.info("Restoring AgentFS snapshot", {
      extra: { snapshotPath: version.snapshotPath },
    });

    const snapshotService = createSnapshotService(projectId);
    await snapshotService.restoreSnapshot(versionId, branchId);

    // 2. Sync files from AgentFS to disk
    logger.info("Syncing files from AgentFS to disk");

    const agent = await openAgentFS(branchDir);
    let synced: number;
    let errors: string[];
    try {
      const result = await syncAgentFSToDisk(agent, branchDir);
      synced = result.synced;
      errors = result.errors;
    } finally {
      await agent.close();
    }

    logger.info("Files synced from snapshot", {
      extra: { synced, errorCount: errors.length },
    });

    // 3. Create revert commit in git (preserves history)
    const revertMessage = `revert: Revert to version #${version.sequenceNumber}${
      version.message ? ` - ${version.message}` : ""
    }`;

    let commitHash: string;
    try {
      commitHash = await Git.commit(
        revertMessage,
        {
          name: session.user.name || "Weldr",
          email: session.user.email || "user@weldr.dev",
        },
        branchDir,
      );

      logger.info("Revert commit created", { extra: { commitHash } });
    } catch (error) {
      // If git commit fails, it might be because git isn't initialized
      logger.warn("Failed to create git commit", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Initialize git and try again
      if (!(await Git.hasGitRepository(branchDir))) {
        await Git.initRepository(projectId, branchId, branchDir);
        commitHash = await Git.commit(
          revertMessage,
          {
            name: session.user.name || "Weldr",
            email: session.user.email || "user@weldr.dev",
          },
          branchDir,
        );
      } else {
        throw error;
      }
    }

    return c.json({
      success: true,
      commitHash,
      snapshotPath: version.snapshotPath,
    });
  } catch (error) {
    logger.error("Revert failed", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        projectId,
        branchId,
        versionId: version.id,
      },
    });
    return c.json(
      { error: error instanceof Error ? error.message : "Revert failed" },
      500,
    );
  }
});

export default router;
