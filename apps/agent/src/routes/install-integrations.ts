import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { getInstalledCategories } from "@/integrations/utils/get-installed-categories";
import { installQueuedIntegrations } from "@/integrations/utils/queue-installer";
import { processIntegrationQueue } from "@/integrations/utils/queue-manager";
import { auth } from "@/lib/auth";
import { createRouter } from "@/lib/utils";
import { workflow } from "@/workflow";

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
        headVersion: true,
      },
    });

    if (!branch || !branch.headVersion) {
      logger.error("No active version found", {
        extra: { projectId },
      });
      return c.json({ success: false }, 500);
    }

    const installedCategories = await getInstalledCategories(branch.headVersion.id);

    const workflowContext = c.get("workflowContext");
    workflowContext.set("project", {
      ...project,
      integrationCategories: new Set(installedCategories),
    });
    workflowContext.set("branch", {
      ...branch,
      headVersion: branch.headVersion,
    });
    workflowContext.set("user", session.user);

    await processIntegrationQueue(workflowContext);

    const result = await installQueuedIntegrations(workflowContext);

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

    if (triggerWorkflow) {
      await workflow.execute({
        context: workflowContext,
      });
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
