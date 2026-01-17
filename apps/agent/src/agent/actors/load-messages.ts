import type { ModelMessage } from "ai";
import { fromPromise } from "xstate";

import { getMessages } from "@/ai/messages";

export const loadMessagesActor = fromPromise<ModelMessage[], { chatId: string }>(
  async ({ input }) => {
    const messages = await getMessages(input.chatId);
    return messages;
  },
);
