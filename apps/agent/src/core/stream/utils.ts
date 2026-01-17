/**
 * Redis-based Server-Sent Events (SSE) streaming implementation
 *
 * This module provides real-time streaming capabilities using Redis pub/sub.
 * Redis is REQUIRED - set REDIS_URL environment variable.
 *
 * Features:
 * - Real-time event distribution via Redis pub/sub
 * - Event buffering for late-joining clients (last 100 events)
 * - Automatic cleanup and graceful shutdown
 * - Multi-client support with separate publisher/subscriber connections
 */

import { createClient, type RedisClientType } from "redis";

import { db, desc, eq } from "@weldr/db";
import { streams } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { SSEEvent, SSEValue } from "@weldr/shared/types";

let redisClient: RedisClientType | null = null;
let redisSubscriber: RedisClientType | null = null;

/**
 * Initialize Redis clients
 */
async function initRedisClients() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required for streaming");
  }

  try {
    // Publisher client
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    // Subscriber client (Redis requires separate connections for pub/sub)
    redisSubscriber = createClient({
      url: process.env.REDIS_URL,
    });

    await Promise.all([redisClient.connect(), redisSubscriber.connect()]);

    Logger.info("Redis clients initialized successfully");
  } catch (error) {
    Logger.error("Failed to initialize Redis clients", { error });
    throw error;
  }
}

/**
 * Get Redis client (initialize if needed)
 */
async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    await initRedisClients();
  }
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }
  return redisClient;
}

/**
 * Get Redis subscriber client
 */
async function getRedisSubscriber(): Promise<RedisClientType> {
  if (!redisSubscriber) {
    await initRedisClients();
  }
  if (!redisSubscriber) {
    throw new Error("Redis subscriber not initialized");
  }
  return redisSubscriber;
}

/**
 * Create a stream ID record in the database
 */
export async function createStreamId(params: { streamId: string; chatId: string }) {
  const { streamId, chatId } = params;

  try {
    await db.insert(streams).values({
      id: streamId,
      chatId,
    });
    console.log(`[Stream] Created stream ID ${streamId} for chat ${chatId}`);
  } catch (error) {
    console.error(`[Stream] Failed to create stream ID:`, error);
  }
}

/**
 * Get all stream IDs for a chat (for resumption)
 */
export async function getStreamIdsByChatId(params: { chatId: string }): Promise<string[]> {
  try {
    const results = await db
      .select({ id: streams.id })
      .from(streams)
      .where(eq(streams.chatId, params.chatId))
      .orderBy(desc(streams.createdAt));

    return results.map((row) => row.id);
  } catch (error) {
    console.error(`[Stream] Failed to get stream IDs for chat ${params.chatId}:`, error);
    return [];
  }
}

/**
 * Create SSE stream with Redis pub/sub support
 */
export async function createSSEStream(
  streamId: string,
  chatId: string,
  lastEventId?: string,
): Promise<ReadableStream<string>> {
  Logger.info("Starting SSE stream", {
    extra: { streamId, chatId, lastEventId },
  });

  const redis = await getRedisClient();
  const subscriber = await getRedisSubscriber();
  const channelName = `chat:${chatId}:events`;
  let isConnected = true;

  return new ReadableStream<string>({
    async start(controller) {
      // Send connection established event
      const connectedEvent = `data: ${JSON.stringify({
        id: nanoid(),
        type: "connected",
        streamId: streamId,
      })}\n\n`;
      controller.enqueue(connectedEvent);

      try {
        // Subscribe to Redis channel for this chat
        await subscriber.subscribe(channelName, (message) => {
          if (!isConnected) return; // Skip if client disconnected

          try {
            const event = JSON.parse(message) as SSEEvent;
            const sseData = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(sseData);
          } catch (error) {
            // Check if it's a disconnect error (enqueue failed)
            if (error instanceof TypeError && error.message.includes("enqueue")) {
              Logger.info("Client disconnected (enqueue failed)", {
                extra: { streamId, chatId },
              });
              isConnected = false;
              // Delete stream record from database
              db.delete(streams)
                .where(eq(streams.id, streamId))
                .catch((err) => {
                  Logger.error("Failed to delete stream from database on disconnect", {
                    error: err,
                  });
                });
            } else {
              Logger.error("Failed to parse Redis message", { error, message });
            }
          }
        });

        // Send buffered events from Redis
        // If lastEventId is provided, only send events after that ID
        const bufferedEvents = await redis.lRange(`${channelName}:buffer`, 0, -1);

        let skipRemaining = !!lastEventId; // Skip until we find the lastEventId
        let foundLastEvent = false;

        for (const eventStr of bufferedEvents) {
          if (!isConnected) break;

          try {
            const event = JSON.parse(eventStr) as SSEEvent;

            // If we're looking for lastEventId, check if this is it
            if (skipRemaining && lastEventId) {
              // Check if this event has an ID and matches our lastEventId
              if ("id" in event && event.id === lastEventId) {
                skipRemaining = false; // Found it, send next events
                foundLastEvent = true;
                continue; // Skip this event (client already has it)
              }
              if (!foundLastEvent) {
                continue; // Keep skipping until we find the lastEventId
              }
            }

            const sseData = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(sseData);
          } catch (error) {
            // Check if it's a disconnect error (enqueue failed)
            if (error instanceof TypeError && error.message.includes("enqueue")) {
              Logger.info("Client disconnected during buffer replay", {
                extra: { streamId, chatId },
              });
              isConnected = false;
              // Delete stream record from database
              db.delete(streams)
                .where(eq(streams.id, streamId))
                .catch((err) => {
                  Logger.error("Failed to delete stream from database", {
                    error: err,
                  });
                });
              break;
            } else {
              Logger.error("Failed to parse buffered event", {
                error,
                eventStr,
              });
            }
          }
        }

        if (lastEventId && !foundLastEvent) {
          Logger.warn("Last event ID not found in buffer, sending all buffered events", {
            extra: { streamId, chatId, lastEventId },
          });
        }

        Logger.info("Redis streaming initialized", {
          extra: { streamId, chatId, channelName },
        });
      } catch (error) {
        Logger.error("Failed to setup Redis streaming", { error });
        isConnected = false;
        controller.error(error);
      }
    },

    async cancel() {
      Logger.info(`Stream ${streamId} cancelled by client`);
      isConnected = false;

      try {
        await subscriber.unsubscribe(channelName);
        // Delete stream record from database
        await db.delete(streams).where(eq(streams.id, streamId));
        Logger.info(`Deleted stream ${streamId} from database on cancel`);
      } catch (error) {
        Logger.error("Failed to cleanup on stream cancel", { error });
      }
    },
  });
}

/**
 * Cleanup stream writer and delete from database
 */
export async function unregisterStreamWriter(streamId: string): Promise<void> {
  try {
    // Delete stream record from database
    await db.delete(streams).where(eq(streams.id, streamId));
    Logger.info(`Deleted stream ${streamId} from database`);
  } catch (error) {
    Logger.error("Failed to cleanup stream from database", { error, streamId });
  }
}

/**
 * Clear the event buffer for a chat
 */
export async function clearChatBuffer(chatId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const channelName = `chat:${chatId}:events`;
    const bufferKey = `${channelName}:buffer`;

    await redis.del(bufferKey);
    Logger.info(`Cleared buffer for chat ${chatId}`);
  } catch (error) {
    Logger.error("Failed to clear chat buffer", { error, chatId });
  }
}

/**
 * Clear all chat buffers
 */
export async function clearAllChatBuffers(): Promise<void> {
  try {
    const redis = await getRedisClient();
    const pattern = "chat:*:events:buffer";
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(keys);
      Logger.info(`Cleared ${keys.length} chat buffers`);
    }
  } catch (error) {
    Logger.error("Failed to clear all chat buffers", { error });
  }
}

/**
 * Stream data to active streams for a chat using Redis pub/sub or in-memory fallback
 */
export async function stream(chatId: string, chunk: SSEValue): Promise<void> {
  const redis = await getRedisClient();
  const channelName = `chat:${chatId}:events`;
  const eventStr = JSON.stringify({
    id: nanoid(),
    ...chunk,
  });

  try {
    // Publish to Redis channel
    await redis.publish(channelName, eventStr);

    const bufferKey = `${channelName}:buffer`;
    await redis.lPush(bufferKey, eventStr);

    await redis.expire(bufferKey, 300); // 5 minutes only

    // Clear buffer after streaming any non-text event
    // Keep buffer only for text events to support resumption
    if (chunk.type !== "text") {
      try {
        await clearChatBuffer(chatId);
      } catch (error) {
        Logger.error("Failed to clear buffer after non-text event", {
          error,
          chatId,
          eventType: chunk.type,
        });
      }
    }

    Logger.debug(`Sent ${chunk.type} via Redis to chat ${chatId}`);
  } catch (error) {
    Logger.error("Failed to publish to Redis", { error });
    throw error;
  }
}

/**
 * Graceful shutdown - close Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    if (redisSubscriber) {
      await redisSubscriber.quit();
      redisSubscriber = null;
    }
    Logger.info("Redis connections closed");
  } catch (error) {
    Logger.error("Error closing Redis connections", { error });
  }
}
