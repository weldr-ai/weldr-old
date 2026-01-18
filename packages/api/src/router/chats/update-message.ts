import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";

import { and, eq } from "@weldr/db";
import { chatMessages, chats } from "@weldr/db/schema";
import type { ChatMessage } from "@weldr/shared/types";
import { updateMessageItemSchema } from "@weldr/shared/validators/chats";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "PUT",
  tags: ["Chats"],
  path: "/chats/:chatId/messages/:id",
  successStatus: 200,
  description: "Update a chat message",
  summary: "Update chat message",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(updateMessageItemSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const userId = context.user.id;

    logger?.info({ chatId: input.chatId, messageId: input.id, userId }, "Updating chat message");

    const chat = await context.db.query.chats.findFirst({
      where: and(eq(chats.id, input.chatId), eq(chats.userId, userId)),
    });

    if (!chat) {
      throw new ORPCError("NOT_FOUND", { message: "Chat not found" });
    }

    const [message] = await context.db
      .update(chatMessages)
      .set({
        content: input.content,
      })
      .where(and(eq(chatMessages.id, input.id), eq(chatMessages.chatId, input.chatId)))
      .returning();

    if (!message) {
      throw new ORPCError("NOT_FOUND", { message: "Message not found" });
    }

    return message as ChatMessage;
  });
