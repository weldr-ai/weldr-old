import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { and, eq } from "@weldr/db";
import { chatMessages, chats } from "@weldr/db/schema";
import type { ChatMessage } from "@weldr/shared/types";
import { addMessageItemSchema } from "@weldr/shared/validators/chats";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "POST",
  tags: ["Chats"],
  path: "/chats/:chatId/messages",
  successStatus: 201,
  description: "Add a message to a chat",
  summary: "Add chat message",
} satisfies Route;

const inputSchema = z.object({
  chatId: z.string(),
  message: addMessageItemSchema,
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ chatId: input.chatId, userId }, "Adding chat message");

    const chat = await context.db.query.chats.findFirst({
      where: and(eq(chats.id, input.chatId), eq(chats.userId, userId)),
    });

    if (!chat) {
      throw new ORPCError("NOT_FOUND", { message: "Chat not found" });
    }

    const [message] = await context.db
      .insert(chatMessages)
      .values({
        ...input.message,
        chatId: input.chatId,
        userId,
      })
      .returning();

    if (!message) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to add message" });
    }

    return message as ChatMessage;
  });
