/**
 * Chat Route
 *
 * Main chat endpoint using AI SDK's streamText with UIMessageStream.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { and, db, desc, eq } from "@weldr/db";
import { branches, chats, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import { runMainAgent } from "@/ai/agent/main-agent";
import type { ChatContext } from "@/ai/agent/types";
import { auth } from "@/core/auth";
import { getInstalledCategories } from "@/core/integrations/utils/get-installed-categories";
import { initChat } from "@/core/project";
import { ensureSnapshotWorkspace, exec } from "@/core/workspace";
import { createRouter } from "@/http/utils";

const route = createRoute({
  method: "post",
  path: "/chat",
  summary: "Chat with AI agent",
  description: "Main chat endpoint using AI SDK streaming",
  tags: ["Chat"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string().openapi({ description: "Project ID" }),
            branchId: z.string().openapi({ description: "Branch ID" }),
            chatId: z.string().optional().openapi({ description: "Chat ID to resume" }),
            messages: z.array(z.any()).openapi({ description: "UI Messages" }),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Streaming response" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
    500: { description: "Internal server error" },
  },
});

const router = createRouter();

router.openapi(route, async (c) => {
  const {
    projectId,
    branchId,
    chatId: providedChatId,
    messages: clientMessages,
  } = c.req.valid("json");
  const traceId = c.req.header("x-request-id") ?? nanoid();

  const logger = Logger.get({ projectId, branchId, traceId });

  // Auth
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get project with integrations
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

  // Get branch with snapshot
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

  // Get or create chat
  let chat = providedChatId
    ? await db.query.chats.findFirst({
        where: and(
          eq(chats.id, providedChatId),
          eq(chats.branchId, branchId),
          eq(chats.userId, session.user.id),
        ),
      })
    : null;

  if (!chat) {
    // Try to find recent chat for this branch
    const recentChat = await db.query.chats.findFirst({
      where: and(eq(chats.branchId, branchId), eq(chats.userId, session.user.id)),
      orderBy: [desc(chats.createdAt)],
    });

    chat = recentChat ?? (await initChat({ projectId, branchId, userId: session.user.id }));
  }

  const defaultModelId = "google:gemini-2.5-pro";

  logger.info("Starting chat session", {
    extra: { chatId: chat.id, modelId: defaultModelId },
  });

  // Ensure workspace exists
  if (snapshotId) {
    await ensureSnapshotWorkspace(snapshotId, projectId);
  }

  // Create UI message stream
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Build context with writer
      const context: ChatContext = {
        chatId: chat.id,
        project: { ...project, integrationCategories: new Set(installedCategories) },
        branch,
        user: session.user,
        modelId: defaultModelId,
        writer,
      };

      await runMainAgent({
        context,
        messages: clientMessages,
        logger,
        chatId: chat.id,
        userId: session.user.id,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
});

export default router;
