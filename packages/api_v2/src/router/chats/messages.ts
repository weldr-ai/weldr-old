import { getLogger } from "@orpc/experimental-pino";
import type { Route } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { chatMessages } from "@weldr/db/schema";
import { Tigris } from "@weldr/shared/tigris";
import type { ChatMessage } from "@weldr/shared/types";

import { protectedProcedure } from "@/lib/procedures";
import { useDb } from "@/middlewares/db";

const definition = {
  method: "GET",
  tags: ["Chats"],
  path: "/chats/:chatId/messages",
  successStatus: 200,
  description: "Get messages for a chat",
  summary: "Get chat messages",
} satisfies Route;

const inputSchema = z.object({
  chatId: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ chatId: input.chatId, userId }, "Getting chat messages");

    const messages = await context.db.query.chatMessages.findMany({
      where: and(eq(chatMessages.chatId, input.chatId), eq(chatMessages.userId, userId)),
      orderBy: (chatMessages, { asc }) => [asc(chatMessages.createdAt)],
      with: {
        attachments: {
          columns: {
            name: true,
            key: true,
          },
        },
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    const generalBucket = process.env.GENERAL_BUCKET;
    if (!generalBucket) {
      throw new Error("GENERAL_BUCKET environment variable is not set");
    }

    const messagesWithAttachments = await Promise.all(
      messages.map(async (message) => {
        const attachments = [];

        for (const attachment of message.attachments) {
          const url = await Tigris.object.getSignedUrl(generalBucket, attachment.key);

          attachments.push({
            name: attachment.name,
            url,
          });
        }

        return {
          ...message,
          attachments,
        };
      }),
    );

    return messagesWithAttachments as ChatMessage[];
  });
