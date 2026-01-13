/**
 * Event Forwarder
 *
 * Forwards actor events to SSE streams and optionally to other sinks (logging, metrics).
 * All forwarding is async and fire-and-forget to avoid blocking the actor.
 */

import { Logger } from "@weldr/shared/logger";
import type { SSEValue } from "@weldr/shared/types";

import { stream } from "@/core/stream";
import type { PublicSessionEvent, WeldrEvent } from "./types";

const logger = Logger.get({ service: "event-forwarder" });

/**
 * Check if an event should be forwarded to SSE.
 * Internal events (prefixed with `_`) are not forwarded.
 */
function isPublicEvent(event: PublicSessionEvent): boolean {
  return !event.type.startsWith("_");
}

/**
 * Map a public session event to an SSE payload.
 * Returns null if the event should not be streamed.
 */
function toSSEPayload(event: PublicSessionEvent): SSEValue | null {
  switch (event.type) {
    // LLM streaming events
    case "llm.delta.text":
      return {
        id: event.messageId,
        type: "text",
        text: event.text,
      };

    case "llm.delta.reasoning":
      return {
        id: event.messageId,
        type: "reasoning",
        text: event.text,
      };

    case "llm.tool_call":
      return {
        id: event.messageId,
        type: "tool-call",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.args,
      };

    // Session lifecycle events -> status updates
    case "session.started":
      return {
        type: "status",
        status: "planning",
      };

    case "session.state.entered":
      return mapStateToStatus(event.state);

    case "session.completed":
      return {
        type: "end",
      };

    case "session.failed":
      return {
        type: "error",
        error: event.error.message,
      };

    case "session.awaiting_user":
      return {
        type: "status",
        status: null, // Waiting for user
      };

    // End of stream marker
    case "llm.completed":
      return {
        type: "end",
      };

    // These events are logged but not sent to SSE
    case "llm.started":
    case "llm.cancelled":
    case "llm.error":
    case "llm.tool_result":
    case "tool.started":
    case "tool.completed":
    case "tool.failed":
    case "orchestrator.started":
    case "orchestrator.agent.started":
    case "orchestrator.agent.completed":
    case "orchestrator.agent.failed":
    case "orchestrator.agent.retrying":
    case "orchestrator.completed":
    case "orchestrator.failed":
    case "iteration.started":
    case "iteration.completed":
    case "session.cancelled":
    case "session.paused":
    case "session.resumed":
      return null;

    default:
      return null;
  }
}

/**
 * Map session state to SSE status.
 */
function mapStateToStatus(
  state: string,
): { type: "status"; status: "planning" | "coding" | "finalizing" | null } | null {
  switch (state) {
    case "initializing":
    case "idle":
      return { type: "status", status: "planning" };

    case "processing":
      return { type: "status", status: "coding" };

    case "finalizing":
      return { type: "status", status: "finalizing" };

    case "awaitingUser":
    case "paused":
      return { type: "status", status: null };

    case "completed":
    case "failed":
    case "cancelled":
      return null; // Handled by specific events

    default:
      return null;
  }
}

/**
 * Create an event forwarder for a specific chat.
 *
 * @param chatId - The chat ID to forward events to
 * @returns A function that handles events
 */
export function createEventForwarder(chatId: string) {
  return async (event: WeldrEvent): Promise<void> => {
    const { type, versionId, traceId, timestamp } = event;

    // Log the event (structured logging)
    logger.debug(`Event: ${type}`, {
      extra: {
        versionId,
        traceId,
        eventType: type,
        timestamp,
      },
    });

    // Forward to SSE if it's a public event
    if (isPublicEvent(event)) {
      const ssePayload = toSSEPayload(event);

      if (ssePayload) {
        try {
          await stream(chatId, ssePayload);
        } catch (error) {
          // Fire and forget - log error but don't throw
          const message = error instanceof Error ? error.message : String(error);
          logger.error("Failed to forward event to SSE", {
            extra: {
              chatId,
              eventType: type,
              error: message,
            },
          });
        }
      }
    }
  };
}

/**
 * Forward an event to SSE (standalone function for simpler use cases).
 */
export async function forwardEventToSSE(chatId: string, event: PublicSessionEvent): Promise<void> {
  if (!isPublicEvent(event)) {
    return;
  }

  const ssePayload = toSSEPayload(event);
  if (!ssePayload) {
    return;
  }

  try {
    await stream(chatId, ssePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to forward event to SSE", {
      extra: {
        chatId,
        eventType: event.type,
        error: message,
      },
    });
  }
}
