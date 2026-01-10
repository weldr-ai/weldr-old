import { useEffect, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import type { ChatMessage, IntegrationCategoryKey, TStatus } from "@weldr/shared/types";

import type { IntegrationToolResultPart } from "@/components/integrations/shared/types";

interface UseStatusOptions {
  version: RouterOutputs["branches"]["byIdOrMain"]["headVersion"];
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

export function useStatus({ version, messages, project }: UseStatusOptions) {
  const getInitialPendingMessage = (): TStatus => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user" && version.status === "planning") {
      return "thinking";
    }
    return null;
  };

  const [status, setStatus] = useState<TStatus>(getInitialPendingMessage());

  // Handle version status changes
  useEffect(() => {
    switch (version.status) {
      case "coding":
        setStatus("coding");
        break;
      case "finalizing":
        setStatus("finalizing");
        break;
      case "completed":
      case "failed":
        setStatus(null);
        break;
      default:
        setStatus(null);
        break;
    }
  }, [version.status]);

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
