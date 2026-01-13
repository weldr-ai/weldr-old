import { createRoute, z } from "@hono/zod-openapi";

import { and, db, eq } from "@weldr/db";
import { branches, projects } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { SSEEvent } from "@weldr/shared/types";

import { auth } from "@/core/auth";
import { readFromStream, registerChatContext } from "@/core/stream";
import { createRouter } from "@/http/utils";

const route = createRoute({
  method: "get",
  path: "/stream/:projectId/:branchId",
  summary: "Subscribe to workflow events",
  description: "Subscribe to workflow events via resumable SSE using Durable Streams",
  tags: ["Agent"],
  request: {
    params: z.object({
      projectId: z.string().openapi({ description: "Project ID" }),
      branchId: z.string().openapi({ description: "Branch ID" }),
    }),
    query: z.object({
      offset: z.string().optional().openapi({
        description: "Durable stream offset for resuming (use -1 for start)",
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
        "X-Stream-Offset": {
          description: "Current stream offset for resumption",
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
    422: {
      description: "Stream already completed",
    },
  },
});

const router = createRouter();

/**
 * Transform Durable Streams JSON array response to SSE format.
 *
 * Durable Streams returns batches of JSON events. We transform each
 * event into SSE format: `data: {...}\n\n`
 */
function createSSETransformStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // Try to parse complete JSON arrays from the buffer
      // Durable Streams sends JSON arrays like: [event1, event2, ...]
      let startIdx = 0;
      let bracketDepth = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === "[") {
          if (bracketDepth === 0) startIdx = i;
          bracketDepth++;
        } else if (char === "]") {
          bracketDepth--;
          if (bracketDepth === 0) {
            // Found a complete array
            const jsonStr = buffer.slice(startIdx, i + 1);
            try {
              const events = JSON.parse(jsonStr) as SSEEvent[];
              for (const event of events) {
                const sseData = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
            } catch {
              // Skip malformed JSON
            }
            buffer = buffer.slice(i + 1);
            i = -1; // Reset to start of new buffer
          }
        }
      }
    },

    flush(controller) {
      // Handle any remaining complete events in buffer
      if (buffer.trim()) {
        try {
          const events = JSON.parse(buffer) as SSEEvent[];
          for (const event of events) {
            const sseData = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch {
          // Ignore incomplete data
        }
      }
    },
  });
}

router.openapi(route, async (c) => {
  const { projectId, branchId } = c.req.valid("param");
  const offset = c.req.query("offset");

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
    branchId,
    chatId: activeVersion.chatId,
  });

  const chatId = activeVersion.chatId;
  const streamId = nanoid();

  // Ensure the chat context is registered for writes
  // (in case the session hasn't started yet or was recovered)
  registerChatContext(chatId, projectId, branchId);

  const isResuming = !!offset && offset !== "-1";

  logger.info("Starting SSE stream via Durable Streams", {
    extra: { streamId, chatId, offset: offset ?? "-1", isResuming },
  });

  try {
    // Read from Durable Streams with live tailing
    const result = await readFromStream(projectId, branchId, chatId, offset, "sse");

    // Get the body stream and transform to SSE format
    const bodyStream = result.bodyStream();
    const sseStream = bodyStream.pipeThrough(createSSETransformStream());

    // Send initial connection event
    const encoder = new TextEncoder();
    const connectedEvent = `data: ${JSON.stringify({
      id: nanoid(),
      type: "connected",
      streamId,
    })}\n\n`;

    // Create a stream that sends the connected event first, then pipes the durable stream
    const combinedStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(connectedEvent));

        const reader = sseStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    logger.info("Created SSE stream", {
      extra: { streamId, chatId, isResuming, initialOffset: result.offset },
    });

    return new Response(combinedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
        "Access-Control-Expose-Headers": "X-Stream-Offset, X-Stream-ID",
        "X-Stream-ID": streamId,
        "X-Stream-Offset": result.offset,
      },
    });
  } catch (error) {
    logger.error("Failed to create stream", {
      extra: { error, streamId, chatId },
    });
    return c.json({ error: "Failed to create stream" }, 500);
  }
});

export default router;
