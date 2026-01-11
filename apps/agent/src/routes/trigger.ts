import { createRoute, z } from "@hono/zod-openapi";
import type { UserContent } from "ai";
import { createActor } from "xstate";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";

import { getOrCreateBashTool } from "@/ai/tools/bash";
import { initVersion } from "@/ai/utils/init-version";
import { insertMessages } from "@/ai/utils/insert-messages";
import { getInstalledCategories } from "@/integrations/utils/get-installed-categories";
import { auth } from "@/lib/auth";
import { createRouter } from "@/lib/utils";
import { sessionMachine } from "@/machines/session";
import { createSessionInput } from "@/session";

const route = createRoute({
  method: "post",
  path: "/trigger",
  summary: "Trigger workflow with user message",
  description: "Trigger workflow with user message",
  tags: ["Agent"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID", example: "123abc" }),
            branchId: z.string().openapi({ description: "Version ID", example: "123abc" }),
            message: z
              .object({
                content: z.custom<Exclude<UserContent, string>>().openapi({
                  description: "Message content",
                  example: [
                    {
                      type: "text",
                      text: "Hello, Weldr!",
                    },
                  ],
                }),
                attachmentIds: z.string().array().optional().openapi({
                  description: "Message attachments",
                  example: [],
                }),
              })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Workflow triggered successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
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
  const { projectId, branchId, message } = c.req.valid("json");

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

  const installedCategories = await getInstalledCategories(projectId);

  const branch = await db.query.branches.findFirst({
    where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
    with: {
      headVersion: true,
    },
  });

  if (!branch || !branch.headVersion) {
    return c.json({ error: "Branch not found" }, 404);
  }

  let activeVersion = branch.headVersion?.status !== "completed" ? branch.headVersion : null;

  const bashTools = await getOrCreateBashTool(projectId, branchId);
  const gitCheckResult = await bashTools.exec("test -d .git && echo exists || echo not_exists");
  if (gitCheckResult.stdout.trim() === "not_exists") {
    await bashTools.exec("git init");
  }

  if (!activeVersion) {
    activeVersion = await initVersion({
      projectId,
      branchId,
      userId: session.user.id,
    });
  }

  if (message && activeVersion) {
    await insertMessages({
      input: {
        chatId: activeVersion.chatId,
        userId: session.user.id,
        messages: [
          {
            role: "user" as const,
            content: message.content,
            attachmentIds: message.attachmentIds,
          },
        ],
      },
    });
  }

  if (activeVersion && activeVersion.status !== "completed" && activeVersion.status !== "failed") {
    const sessionInput = createSessionInput({
      project: { ...project, integrationCategories: new Set(installedCategories) },
      branch: { ...branch, headVersion: activeVersion },
      user: session.user,
    });

    const sessionActor = createActor(sessionMachine, { input: sessionInput });
    sessionActor.start();
    sessionActor.send({ type: "START" });
  }

  return c.json({ success: true });
});

export default router;
