import type { z } from "zod";

import { and, db, eq } from "@weldr/db";
import { chatMessages, chats } from "@weldr/db/schema";
import type { addMessagesInputSchema } from "@weldr/shared/validators/chats";

export async function insertMessages({
  input,
}: {
  input: z.infer<typeof addMessagesInputSchema> & {
    userId: string;
  };
}) {
  if (input.messages.length === 0) {
    return [];
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, input.chatId), eq(chats.userId, input.userId)),
  });

  if (!chat) {
    throw new Error("Chat not found");
  }

  const insertedMessages = await db.transaction(async (tx) => {
    const insertedMessages: (typeof chatMessages.$inferInsert)[] = [];

    for (const item of input.messages) {
      const [insertedMessage] = await tx
        .insert(chatMessages)
        .values({
          id: item.id,
          role: item.role,
          content: item.content,
          metadata: item.role === "assistant" ? item.metadata : undefined,
          userId: input.userId,
          chatId: input.chatId,
          createdAt: item.createdAt,
        })
        .returning();

      if (insertedMessage) {
        insertedMessages.push(insertedMessage);
      }
    }

    return insertedMessages;
  });

  return insertedMessages.map((message) => message.id);
}
