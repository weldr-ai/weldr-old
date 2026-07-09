import fastDeepEqual from "fast-deep-equal";
import { type Dispatch, memo, type SetStateAction } from "react";

import type { RouterOutputs } from "@weldr/api";
import { nanoid } from "@weldr/shared/nanoid";
import { preprocessReferences } from "@weldr/shared/process-text";
import type { AddIntegrationsInput, ChatMessage, TStatus } from "@weldr/shared/types";
import { WeldrLogo } from "@weldr/ui/components/logos/weldr";
import { cn } from "@weldr/ui/lib/utils";

import { ConfigureIntegrationsPrompt } from "@/components/integrations/configure-integrations-prompt";
import { IntegrationsInstallationStatus } from "@/components/integrations/shared/integrations-installation-status";
import type {
  IntegrationToolCall,
  IntegrationToolMessage,
} from "@/components/integrations/shared/types";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";
import { Response } from "./response";

const PureMessageItem = ({
  message,
  branchId,
  integrationTemplates,
  setMessages,
  setStatus,
  environmentVariables,
  project,
}: {
  message: ChatMessage;
  branchId: string;
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStatus: Dispatch<SetStateAction<TStatus>>;
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  project: RouterOutputs["projects"]["get"];
}) => {
  // Normalize content to always be an array (schema now allows string content)
  const contentParts =
    typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content;

  return (
    <div
      className={cn("flex flex-col text-sm", message.role === "user" && "items-end")}
      key={message.id}
    >
      {message.role === "assistant" && (
        <div className="flex items-center gap-1 pb-2">
          <WeldrLogo className="size-5" />
          <span className="text-xs text-muted-foreground">Weldr</span>
        </div>
      )}

      <div
        className={cn("flex flex-col gap-2", {
          "rounded-md bg-primary p-2 text-primary-foreground": message.role === "user",
        })}
      >
        {contentParts.map((content) => {
          switch (content.type) {
            case "reasoning": {
              return (
                <Reasoning key="reasoning" className="w-full" isStreaming={true}>
                  <ReasoningTrigger />
                  <ReasoningContent>{content.text}</ReasoningContent>
                </Reasoning>
              );
            }
            case "text": {
              const transformedContent = preprocessReferences(content.text);
              return (
                <Response
                  key="content"
                  className={cn({
                    "text-primary-foreground": message.role === "user",
                  })}
                >
                  {transformedContent}
                </Response>
              );
            }
            case "tool-call": {
              // Handle add_integrations tool call - show integration config UI
              if (content.toolName === "add_integrations") {
                const toolCall = content as IntegrationToolCall;
                const toolInput = toolCall.input as AddIntegrationsInput;
                // Only show config if there are categories to configure
                if (toolInput.categories && toolInput.categories.length > 0) {
                  return (
                    <ConfigureIntegrationsPrompt
                      key={`tool-call-${toolCall.toolCallId || nanoid()}`}
                      message={message}
                      branchId={branchId}
                      integrationTemplates={integrationTemplates}
                      chatId={message.chatId}
                      setMessages={setMessages}
                      environmentVariables={environmentVariables}
                      project={project}
                      setStatus={setStatus}
                    />
                  );
                }
              }
              return null;
            }
            default:
              return null;
          }
        })}
        {message.role === "tool" &&
          contentParts.some(
            (content) => "toolName" in content && content.toolName === "add_integrations",
          ) && <IntegrationsInstallationStatus message={message as IntegrationToolMessage} />}
      </div>
    </div>
  );
};

export const MessageItem = memo(PureMessageItem, (prevProps, nextProps) => {
  if (
    !fastDeepEqual(prevProps.message, nextProps.message) ||
    !fastDeepEqual(prevProps.environmentVariables, nextProps.environmentVariables)
  ) {
    return false;
  }
  return true;
});
