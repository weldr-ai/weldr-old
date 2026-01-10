import equal from "fast-deep-equal";
import { type Dispatch, memo, type SetStateAction } from "react";

import type { RouterOutputs } from "@weldr/api";
import { nanoid } from "@weldr/shared/nanoid";
import type { ChatMessage, TStatus } from "@weldr/shared/types";

import { MessageItem } from "./message-item";

interface MessagesProps {
  messages: ChatMessage[];
  branchId: string;
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  project: RouterOutputs["projects"]["byId"];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStatus: Dispatch<SetStateAction<TStatus>>;
}

function PureMessages({
  messages,
  branchId,
  integrationTemplates,
  environmentVariables,
  project,
  setMessages,
  setStatus,
}: MessagesProps) {
  return (
    <>
      {messages.map((message) => (
        <MessageItem
          key={message.id ?? nanoid()}
          message={message}
          branchId={branchId}
          integrationTemplates={integrationTemplates}
          environmentVariables={environmentVariables}
          project={project}
          setMessages={setMessages}
          setStatus={setStatus}
        />
      ))}
    </>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.environmentVariables, nextProps.environmentVariables)) return false;
  return true;
});
