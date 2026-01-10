import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";

import { auth } from "@/lib/auth";
import {
  createSSEStream,
  createStreamId,
  getStreamIdsByChatId,
  unregisterStreamWriter,
} from "@/lib/stream-utils";
import { createRouter } from "@/lib/utils";

const route = createRoute({
  method: "get",
  path: "/stream/:projectId/:branchId",
  summary: "Subscribe to workflow events",
  description: "Subscribe to workflow events via resumable SSE",
  tags: ["Agent"],
  request: {
    params: z.object({
      projectId: z.string().openapi({ description: "Project ID" }),
      branchId: z.string().openapi({ description: "Branch ID" }),
    }),
    query: z.object({
      lastEventId: z.string().optional().openapi({
        description: "Last received event ID for resuming streams",
      }),
    }),
  },
  responses: {
    200: {
      description: "SSE stream started",
      headers: {
        "Content-Type": {
          description: "text/event-stream",
        },
        "Cache-Control": {
          description: "no-cache",
        },
        Connection: {
          description: "keep-alive",
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
  const { projectId, branchId } = c.req.valid("param");
  const lastEventId = c.req.query("lastEventId");

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
  });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const branch = await db.query.branches.findFirst({
    where: and(eq(branches.id, branchId), eq(branches.projectId, projectId)),
    with: {
      headVersion: true,
    },
  });

  if (!branch) {
    return c.json({ error: "Branch not found" }, 404);
  }

  if (!branch.headVersion) {
    return c.json({ error: "No head version found" }, 404);
  }

  const activeVersion = branch.headVersion;

  if (activeVersion.status === "completed" || activeVersion.status === "failed") {
    return c.json({ message: "Stream is already completed" }, 422);
  }

  const logger = Logger.get({
    projectId,
    chatId: activeVersion.chatId,
  });

  const chatId = activeVersion.chatId;

  // If we have a Last-Event-ID, try to find the existing stream to resume
  let streamId: string | undefined;
  let isResuming = false;

  if (lastEventId) {
    // Find the most recent stream for this chat to resume
    const existingStreamIds = await getStreamIdsByChatId({ chatId });

    if (existingStreamIds.length > 0) {
      // Use the most recent stream ID for resumption
      streamId = existingStreamIds.at(0);

      if (!streamId) {
        return c.json({ error: "No stream ID found" }, 400);
      }

      isResuming = true;

      logger.info("Resuming existing stream", {
        extra: { lastEventId, streamId, chatId },
      });
    } else {
      // No existing streams found, create new one
      streamId = nanoid();
      logger.info("No existing stream found, creating new one", {
        extra: { lastEventId, streamId, chatId },
      });
    }
  } else {
    // New stream
    streamId = nanoid();
    logger.info("Creating new stream", {
      extra: { streamId, chatId },
    });
  }

  try {
    // Only create stream record if it's a new stream
    if (!isResuming) {
      await createStreamId({ streamId, chatId });
    }

    // Create Redis-based SSE stream
    const stream = await createSSEStream(streamId, chatId, lastEventId);

    logger.info("Created SSE stream", {
      extra: { streamId, chatId, isResuming },
    });

    return new Response(stream as ReadableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control, Last-Event-ID",
        "Access-Control-Expose-Headers": "Last-Event-ID",
        "X-Stream-ID": streamId,
      },
    });
  } catch (error) {
    logger.error("Failed to create stream", {
      extra: { error, streamId, chatId },
    });
    // Clean up on error
    if (streamId) {
      await unregisterStreamWriter(streamId);
    }
    return c.json({ error: "Failed to create stream" }, 500);
  } finally {
    // Additional cleanup on request abort (backup mechanism)
    if (streamId) {
      c.req.raw.signal?.addEventListener("abort", async () => {
        await unregisterStreamWriter(streamId);
        logger.info("Cleaned up stream writer on request abort", {
          extra: { streamId, chatId },
        });
      });
    }
  }
});

export default router;
