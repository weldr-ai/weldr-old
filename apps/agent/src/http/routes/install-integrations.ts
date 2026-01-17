import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import { auth } from "@/core/auth";
import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { installQueuedIntegrations } from "@/core/integrations/utils/queue-installer";
import { processIntegrationQueue } from "@/core/integrations/utils/queue-manager";
import { createRouter } from "@/http/utils";
import { type ExecutionContext, sessionRegistry } from "@/session";

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
            chatId: z.string().optional().openapi({ description: "Chat ID for session creation" }),
            startSession: z.boolean().optional().default(false).openapi({
              description: "Whether to start a session after installation",
            }),
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
  const { projectId, branchId, chatId, startSession } = c.req.valid("json");
  const logger = Logger.get({ projectId });
  const traceId = c.req.header("x-request-id") ?? nanoid();

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
      return c.json({ success: false, error: "No active snapshot found for branch" }, 500);
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

    logger.info("Integration installation completed successfully", {
      extra: { installedCount: result.installedIntegrations.length },
    });

    // Start session if requested and chatId is provided
    if (startSession && chatId) {
      logger.info("Starting session after integration installation", {
        extra: { chatId },
      });

      const sessionActor = await sessionRegistry.getOrCreate({
        chatId,
        traceId,
        project: {
          ...project,
          integrationCategories: new Set(installedCategories),
        },
        branch,
        user: session.user,
      });

      sessionActor.send({ type: "START" });
    }

    return c.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Integration installation process failed", {
      extra: { error: errorMessage },
    });

    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default router;
