import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { auth } from "@/core/auth";
import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { installQueuedIntegrations } from "@/core/integrations/utils/queue-installer";
import { processIntegrationQueue } from "@/core/integrations/utils/queue-manager";
import { createRouter } from "@/http/utils";
import { type ExecutionContext } from "@/session";

const route = createRoute({
  method: "post",
  path: "/integrations/install",
  summary: "Install queued integrations",
  description: "Process and install all queued integrations for a project",
  tags: ["Integrations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID" }),
            branchId: z.string().openapi({ description: "Branch ID" }),
            triggerWorkflow: z.boolean().optional().default(false),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Integrations installed successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            installedIntegrations: z.array(
              z.object({
                id: z.string(),
                key: z.string(),
                status: z.string(),
              }),
            ),
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
      description: "Project not found",
    },
    500: {
      description: "Installation failed",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

const router = createRouter();

router.openapi(route, async (c) => {
  const { projectId, branchId, triggerWorkflow } = c.req.valid("json");
  const logger = Logger.get({ projectId });

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      with: {
        integrations: {
          with: {
            integrationTemplate: {
              with: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
      with: {
        snapshot: true,
      },
    });

    if (!branch || !branch.snapshot) {
      logger.error("No active snapshot found", {
        extra: { projectId },
      });
      return c.json({ success: false }, 500);
    }

    const installedCategories = await getInstalledCategories(branch.snapshot.id);

    const sessionContext: ExecutionContext = {
      project: {
        ...project,
        integrationCategories: new Set(installedCategories),
      },
      branch: {
        ...branch,
        snapshot: branch.snapshot,
      },
      user: session.user,
    };

    await processIntegrationQueue(sessionContext);

    const result = await installQueuedIntegrations(sessionContext);

    if (result.status === "error") {
      logger.error("Integration installation failed", {
        extra: { error: result.error },
      });
      return c.json(
        {
          success: false,
          error: result.error,
        },
        500,
      );
    }

    // FIXME: this is a HUGE problem here is whole thing does not work now
    if (triggerWorkflow) {
      // Note: triggerWorkflow requires a chatId to create a session
      // This route currently doesn't have chatId context, so we skip session creation
      logger.warn("triggerWorkflow requested but chatId not available in this context");
    }

    logger.info("Integration installation completed successfully", {
      extra: { installedCount: result.installedIntegrations.length },
    });

    return c.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Integration installation process failed", {
      extra: { error: errorMessage },
    });

    return c.json({ success: false }, 500);
  }
});

export default router;
