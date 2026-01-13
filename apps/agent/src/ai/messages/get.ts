import { db, eq } from "@weldr/db";
import { chats } from "@weldr/db/schema";
import type { ChatMessage } from "@weldr/shared/types";

import { convertMessages } from "./convert";

export async function getMessages(chatId: string) {
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      messages: {
        orderBy: (chatMessages, { asc }) => [asc(chatMessages.createdAt)],
      },
    },
  });

  if (!chat) {
    throw new Error("Chat not found");
  }

  const promptMessages = await convertMessages(chat.messages as ChatMessage[]);

  return promptMessages;
}
