import { createRoute, z } from "@hono/zod-openapi";
import type { UserContent } from "ai";

import { and, db, desc, eq } from "@weldr/db";
import { branches, chats, projects } from "@weldr/db/schema";
import { nanoid } from "@weldr/shared/nanoid";

import { insertMessages } from "@/ai/messages";
import { auth } from "@/core/auth";
import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { initChat } from "@/core/project";
import { exec } from "@/core/workspace";
import { createRouter } from "@/http/utils";
import { sessionRegistry } from "@/session";

const route = createRoute({
  method: "post",
  path: "/session",
  summary: "Start or resume a session",
  description: "Start or resume a session, optionally sending a user message",
  tags: ["Session"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID", example: "123abc" }),
            branchId: z.string().openapi({ description: "Branch ID", example: "123abc" }),
            chatId: z
              .string()
              .optional()
              .openapi({ description: "Chat ID to resume", example: "123abc" }),
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
      description: "Session started successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            chatId: z.string().optional(),
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
  const { projectId, branchId, chatId: providedChatId, message } = c.req.valid("json");

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
      snapshot: true,
    },
  });

  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  // Initialize git repository if needed
  const snapshotId = branch.snapshot?.id;
  if (snapshotId) {
    const gitCheckResult = await exec("test -d .git && echo exists || echo not_exists", {
      projectId,
      snapshotId,
    });
    if (gitCheckResult.stdout.trim() === "not_exists") {
      await exec("git init", { projectId, snapshotId });
    }
  }

  // Find or create a chat for this session
  let activeChat: typeof chats.$inferSelect | null = null;

  if (providedChatId) {
    // Resume existing chat
    const foundChat = await db.query.chats.findFirst({
      where: and(
        eq(chats.id, providedChatId),
        eq(chats.branchId, branchId),
        eq(chats.userId, session.user.id),
      ),
    });
    activeChat = foundChat ?? null;
  }

  if (!activeChat) {
    // Try to find the most recent chat for this branch
    const recentChat = await db.query.chats.findFirst({
      where: and(eq(chats.branchId, branchId), eq(chats.userId, session.user.id)),
      orderBy: [desc(chats.createdAt)],
    });

    // Check if we have an active session for this chat
    if (recentChat && sessionRegistry.has(recentChat.id)) {
      activeChat = recentChat;
    } else {
      // Create a new chat for this branch
      const newChat = await initChat({
        projectId,
        branchId,
        userId: session.user.id,
      });
      activeChat = newChat;
    }
  }

  // Insert the user message
  if (message && activeChat) {
    await insertMessages({
      input: {
        chatId: activeChat.id,
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

  // Get or create session actor using the registry
  // The registry handles state restoration from DB and event forwarding
  const traceId = c.req.header("x-request-id") ?? nanoid();

  const sessionActor = await sessionRegistry.getOrCreate({
    chatId: activeChat.id,
    traceId,
    project: { ...project, integrationCategories: new Set(installedCategories) },
    branch,
    user: session.user,
  });

  // Send user message event to the actor
  if (message) {
    sessionActor.send({
      type: "_user.message",
      content: message.content,
      attachmentIds: message.attachmentIds,
    });
  } else {
    // No message, just start processing
    sessionActor.send({ type: "START" });
  }

  return c.json({ success: true, chatId: activeChat.id });
});

export default router;
