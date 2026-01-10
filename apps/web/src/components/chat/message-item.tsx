"use client";

import fastDeepEqual from "fast-deep-equal";
import { type Dispatch, memo, type SetStateAction } from "react";

import type { RouterOutputs } from "@weldr/api";
import { nanoid } from "@weldr/shared/nanoid";
import { preprocessReferences } from "@weldr/shared/process-text";
import type { ChatMessage, TStatus } from "@weldr/shared/types";
import { LogoIcon } from "@weldr/ui/icons";
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
  project: RouterOutputs["projects"]["byId"];
}) => {
  return (
    <div
      className={cn("flex flex-col text-sm", message.role === "user" && "items-end")}
      key={message.id}
    >
      {message.role === "assistant" && (
        <div className="flex items-center gap-1 pb-2">
          <LogoIcon className="size-5" />
          <span className="text-muted-foreground text-xs">Weldr</span>
        </div>
      )}

      <div
        className={cn("flex flex-col gap-2", {
          "rounded-md bg-primary p-2 text-primary-foreground": message.role === "user",
        })}
      >
        {message.content.map((content) => {
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
              const toolInput = content.input as {
                status: "awaiting_config" | "failed";
              };
              if (
                content.toolName === "add_integrations" &&
                toolInput.status === "awaiting_config"
              ) {
                const toolCall = content as IntegrationToolCall;
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
              return null;
            }
            default:
              return null;
          }
        })}
        {message.role === "tool" &&
          message.content.some((content) => content.toolName === "add_integrations") && (
            <IntegrationsInstallationStatus message={message as IntegrationToolMessage} />
          )}
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
