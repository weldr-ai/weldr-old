import { useEffect, useState } from "react";

import type { ChatMessage, IntegrationCategoryKey, TStatus } from "@weldr/shared/types";

import type { IntegrationToolResultPart } from "@/components/integrations/shared/types";

interface UseStatusOptions {
  messages: ChatMessage[];
  project: {
    integrations: Array<{
      integrationTemplate: {
        category: {
          key: IntegrationCategoryKey;
        };
      };
    }>;
  };
}

export function useStatus({ messages, project }: UseStatusOptions) {
  const getInitialPendingMessage = (): TStatus => {
    const lastMessage = messages[messages.length - 1];
    // Check if there's an unanswered user message
    if (lastMessage?.role === "user") {
      return "thinking";
    }
    return null;
  };

  const [status, setStatus] = useState<TStatus>(getInitialPendingMessage());

  // Handle integration setup waiting state
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "tool") {
      const installedCategories = project.integrations.map(
        (integration) => integration.integrationTemplate.category.key,
      );

      const toolResult = lastMessage.content.find(
        (content) => content.type === "tool-result" && content.toolName === "add_integrations",
      ) as IntegrationToolResultPart;

      if (
        toolResult?.output?.value?.status === "awaiting_config" &&
        toolResult?.output?.value?.categories.some(
          (category) => !installedCategories.includes(category),
        )
      ) {
        setStatus("waiting");
      }
    }
  }, [messages, project.integrations]);

  return {
    status,
    setStatus,
  };
}
