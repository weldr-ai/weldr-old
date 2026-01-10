import { useEffect, useState } from "react";

import { nanoid } from "@weldr/shared/nanoid";
import type { Attachment, ChatMessage, UserMessage } from "@weldr/shared/types";

interface UseMessagesOptions {
  initialMessages: ChatMessage[];
  chatId: string;
  session: {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
  } | null;
}

export function useMessages({ initialMessages, chatId, session }: UseMessagesOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [userMessageContent, setUserMessageContent] = useState<UserMessage["content"]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    setMessages(initialMessages);
    // Clear user input when switching chats
    setUserMessageContent([]);
    setAttachments([]);
  }, [chatId, initialMessages]);

  const handleSubmit = async () => {
    if (userMessageContent.length === 0) {
      return;
    }

    // Create the user message for local state
    const newMessageUser = {
      id: nanoid(),
      role: "user",
      createdAt: new Date(),
      content: userMessageContent,
      attachments,
      chatId,
      userId: session?.user.id,
      user: session?.user
        ? {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? undefined,
          }
        : undefined,
    } as ChatMessage;

    // Add to local state immediately for better UX
    setMessages((prevMessages) => [...prevMessages, newMessageUser]);

    // Clear the input
    setUserMessageContent([]);
    setAttachments([]);
  };

  return {
    messages,
    setMessages,
    userMessageContent,
    setUserMessageContent,
    attachments,
    setAttachments,
    handleSubmit,
  };
}
