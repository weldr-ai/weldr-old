/**
 * Durable Streams implementation for reliable, resumable SSE streaming.
 *
 * Uses @durable-streams/server embedded in the agent service.
 * Streams are keyed by projectId/snapshotId/chatId for isolation.
 *
 * Features:
 * - Offset-based resumption (clients can resume from any position)
 * - Shared streams (multiple clients can subscribe to same stream)
 * - Short TTL for transient session streams
 * - JSON mode for structured events
 */

import { DurableStream } from "@durable-streams/client";
import { DurableStreamTestServer } from "@durable-streams/server";

import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { SSEValue } from "@weldr/shared/types";

let server: DurableStreamTestServer | null = null;
let baseUrl: string | null = null;

const STREAM_PORT = 4437;
const STREAM_TTL_SECONDS = 300; // 5 minutes

// Registry mapping chatId to projectId/snapshotId for context lookup
type StreamContext = { projectId: string; snapshotId: string };
const chatContextRegistry = new Map<string, StreamContext>();

/**
 * Register a chat's context for stream routing.
 * Called when a session starts to enable chatId-only writes.
 */
export function registerChatContext(chatId: string, projectId: string, snapshotId: string): void {
  chatContextRegistry.set(chatId, { projectId, snapshotId });
  Logger.debug("Registered chat context for durable streams", {
    extra: { chatId, projectId, snapshotId },
  });
}

/**
 * Unregister a chat's context when session ends.
 */
export function unregisterChatContext(chatId: string): void {
  chatContextRegistry.delete(chatId);
}

/**
 * Get the stream context for a chat.
 */
export function getChatContext(chatId: string): StreamContext | undefined {
  return chatContextRegistry.get(chatId);
}

/**
 * Initialize the embedded Durable Streams server
 */
export async function initDurableStreams(): Promise<void> {
  if (server) {
    Logger.warn("Durable Streams server already initialized");
    return;
  }

  try {
    server = new DurableStreamTestServer({
      port: STREAM_PORT,
      host: "127.0.0.1",
    });

    await server.start();
    baseUrl = server.url;

    Logger.info("Durable Streams server initialized", {
      extra: { baseUrl, port: STREAM_PORT },
    });
  } catch (error) {
    Logger.error("Failed to initialize Durable Streams server", { error });
    throw error;
  }
}

/**
 * Shutdown the Durable Streams server
 */
export async function closeDurableStreams(): Promise<void> {
  if (!server) {
    return;
  }

  try {
    await server.stop();
    server = null;
    baseUrl = null;
    Logger.info("Durable Streams server closed");
  } catch (error) {
    Logger.error("Error closing Durable Streams server", { error });
  }
}

/**
 * Get the base URL for Durable Streams
 */
export function getDurableStreamsBaseUrl(): string {
  if (!baseUrl) {
    throw new Error("Durable Streams server not initialized");
  }
  return baseUrl;
}

/**
 * Build the stream path for a chat session
 */
export function buildStreamPath(projectId: string, snapshotId: string, chatId: string): string {
  return `stream/${projectId}/${snapshotId}/${chatId}`;
}

/**
 * Build the full stream URL for a chat session
 */
export function buildStreamUrl(projectId: string, snapshotId: string, chatId: string): string {
  return `${getDurableStreamsBaseUrl()}/v1/${buildStreamPath(projectId, snapshotId, chatId)}`;
}

// Cache of DurableStream handles by stream path
const streamHandles = new Map<string, DurableStream>();

/**
 * Get or create a DurableStream handle for a chat session
 */
async function getOrCreateStreamHandle(
  projectId: string,
  snapshotId: string,
  chatId: string,
): Promise<DurableStream> {
  const path = buildStreamPath(projectId, snapshotId, chatId);

  let handle = streamHandles.get(path);
  if (handle) {
    return handle;
  }

  const url = buildStreamUrl(projectId, snapshotId, chatId);

  try {
    // Try to create a new stream
    handle = await DurableStream.create({
      url,
      contentType: "application/json",
      ttlSeconds: STREAM_TTL_SECONDS,
    });

    streamHandles.set(path, handle);
    Logger.debug("Created new durable stream", { extra: { path, url } });

    return handle;
  } catch (error) {
    // Stream might already exist, try to get a handle to it
    if (error instanceof Error && error.message.includes("409")) {
      handle = new DurableStream({ url });
      streamHandles.set(path, handle);
      Logger.debug("Connected to existing durable stream", { extra: { path, url } });
      return handle;
    }
    throw error;
  }
}

/**
 * Append an event to a chat stream.
 *
 * Writes SSE events to the durable stream for the given chat session.
 */
export async function appendToStream(
  projectId: string,
  snapshotId: string,
  chatId: string,
  chunk: SSEValue,
): Promise<void> {
  const handle = await getOrCreateStreamHandle(projectId, snapshotId, chatId);

  const event = {
    id: nanoid(),
    ...chunk,
  };

  await handle.append(event);

  Logger.debug(`Sent ${chunk.type} to chat stream`, {
    extra: { chatId },
  });
}

/**
 * Read from a chat stream starting at a given offset.
 *
 * Returns a readable stream for consuming SSE events with resumption support.
 */
export async function readFromStream(
  projectId: string,
  snapshotId: string,
  chatId: string,
  offset?: string,
  live: boolean | "auto" | "long-poll" | "sse" = "sse",
): Promise<{
  bodyStream: () => AsyncIterable<Uint8Array> & ReadableStream<Uint8Array>;
  offset: string;
}> {
  const handle = await getOrCreateStreamHandle(projectId, snapshotId, chatId);

  const response = await handle.stream({
    offset: offset ?? "-1",
    live: live === true ? "auto" : live === false ? false : live,
  });

  return {
    bodyStream: response.bodyStream,
    offset: response.offset,
  };
}

/**
 * Delete a chat stream (cleanup after session ends).
 */
export async function deleteStream(
  projectId: string,
  snapshotId: string,
  chatId: string,
): Promise<void> {
  const path = buildStreamPath(projectId, snapshotId, chatId);
  const url = buildStreamUrl(projectId, snapshotId, chatId);

  try {
    await fetch(url, { method: "DELETE" });
    streamHandles.delete(path);
    Logger.debug("Deleted chat stream", { extra: { path } });
  } catch (error) {
    Logger.warn("Failed to delete chat stream", { extra: { path, error } });
  }
}

/**
 * Clear all cached stream handles (for testing/cleanup)
 */
export function clearStreamHandles(): void {
  streamHandles.clear();
}

/**
 * Append an event to a chat stream using only chatId.
 *
 * Convenience function that looks up project/snapshot context automatically.
 * The chatId must be registered via registerChatContext() before use.
 */
export async function stream(chatId: string, chunk: SSEValue): Promise<void> {
  const context = chatContextRegistry.get(chatId);

  if (!context) {
    Logger.warn("No context registered for chatId, cannot append to stream", {
      extra: { chatId, chunkType: chunk.type },
    });
    return;
  }

  await appendToStream(context.projectId, context.snapshotId, chatId, chunk);
}
