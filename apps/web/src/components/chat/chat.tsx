import { useChat, type Message } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import equal from "fast-deep-equal";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import type { Session } from "@weldr/auth";
import { nanoid } from "@weldr/shared/nanoid";
import type { Attachment, ChatMessage, TStatus, UserMessage } from "@weldr/shared/types";
import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useEditorReferences } from "@/hooks/use-editor-references";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { orpc } from "@/lib/orpc";
import { parseConventionalCommit } from "@/lib/utils";
import { CommitTypeBadge } from "../commit-type-badge";
import { Timeline, TimelineContent, TimelineTrigger } from "../timeline";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input/multimodal-input";

const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8081";

interface ChatProps {
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  project: RouterOutputs["projects"]["get"];
  branch: RouterOutputs["branches"]["getByIdOrMain"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  session: Session | null;
}

// Convert database ChatMessage[] to AI SDK Message[] for useChat initialMessages
function dbToMessages(dbMessages: ChatMessage[]): Message[] {
  return dbMessages.map((msg) => {
    // Handle both string and array content formats
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("");

    return {
      id: msg.id,
      role: msg.role as "user" | "assistant" | "system",
      content,
      createdAt: new Date(msg.createdAt),
    };
  });
}

// Convert AI SDK Message[] to ChatMessage[] for existing components
function messagesToDB(messages: Message[], chatId: string): ChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: (msg.role === "system" ? "user" : msg.role) as "user" | "assistant",
    content: msg.content, // Schema now accepts string content directly
    chatId,
    createdAt: msg.createdAt ?? new Date(),
  })) as ChatMessage[];
}

export const Chat = memo<ChatProps>(
  ({ integrationTemplates, project, branch, environmentVariables, session }) => {
    const chat = branch.chats?.[0];
    const snapshot = branch.snapshot;
    const queryClient = useQueryClient();

    const [status, setStatus] = useState<TStatus>("idle");
    // UserMessage content - initialize as empty array for editor input
    const [userMessageContent, setUserMessageContent] = useState<UserMessage["content"]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isTimelineOpen, setIsTimelineOpen] = useState(true);

    const isSubmittingRef = useRef(false);

    // Convert initial messages from DB format to AI SDK format
    const initialMessages = chat?.messages ? dbToMessages(chat.messages as ChatMessage[]) : [];

    const {
      messages: uiMessages,
      append,
      status: chatStatus,
      error,
    } = useChat({
      id: chat?.id,
      api: `${AGENT_URL}/chat`,
      credentials: "include",
      body: {
        projectId: project.id,
        branchId: branch.id,
        chatId: chat?.id,
      },
      initialMessages,
      onResponse: (response) => {
        if (!response.ok) {
          console.error("Chat response error:", response.status);
        }
      },
      onFinish: () => {
        setStatus("idle");
        queryClient.invalidateQueries({
          queryKey: orpc.branches.getByIdOrMain.queryKey({
            input: { id: branch.id, projectId: project.id },
          }),
        });
      },
      onError: (err) => {
        console.error("Chat error:", err);
        setStatus("idle");
      },
    });

    // Convert AI SDK messages to DB format for existing components
    const messages = messagesToDB(uiMessages, chat?.id ?? "");

    const setMessages = useCallback((_updater: React.SetStateAction<ChatMessage[]>) => {
      // AI SDK manages messages internally
    }, []);

    const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>(messages);

    const { isChatVisible, chatContainerRef, handleInputFocus, toggleChatVisibility } =
      useChatVisibility();

    useEffect(() => {
      if (chatStatus === "streaming") {
        if (status === "idle") {
          setStatus("responding");
        }
      } else if (chatStatus === "submitted") {
        setStatus("thinking");
      }
    }, [chatStatus, status]);

    useEffect(() => {
      if (error) {
        setStatus("idle");
      }
    }, [error]);

    const handleSubmit = useCallback(async () => {
      // Handle both string and array content
      const isEmpty =
        typeof userMessageContent === "string"
          ? userMessageContent.length === 0
          : userMessageContent.length === 0;

      if (isSubmittingRef.current || isEmpty) {
        return;
      }

      isSubmittingRef.current = true;
      setStatus("thinking");

      try {
        const textContent =
          typeof userMessageContent === "string"
            ? userMessageContent
            : userMessageContent
                .filter((c) => c.type === "text")
                .map((c) => (c as { text: string }).text)
                .join("");

        await append({
          id: nanoid(),
          role: "user",
          content: textContent,
          createdAt: new Date(),
        });

        setUserMessageContent([]);
        setAttachments([]);
      } catch (err) {
        console.error("Failed to send message:", err);
        setStatus("idle");
      } finally {
        setTimeout(() => {
          isSubmittingRef.current = false;
        }, 500);
      }
    }, [userMessageContent, append]);

    const editorReferences = useEditorReferences({ snapshot });
    const conventionalCommit = parseConventionalCommit(snapshot?.title ?? null);

    return (
      <div
        ref={chatContainerRef}
        className={cn(
          "flex size-full flex-col justify-end rounded-lg border bg-background dark:bg-muted",
          {
            "transition-all delay-300 ease-in-out": !isChatVisible,
            "transition-none": attachments.length > 0 || isChatVisible,
          },
        )}
      >
        <Timeline open={isTimelineOpen} onOpenChange={setIsTimelineOpen} branch={branch}>
          <TimelineContent className="border-b" />
          <div className="flex items-center justify-between gap-2 border-b px-2 py-1 pr-1 text-xs">
            <div className="flex w-full items-center gap-2 truncate font-medium">
              <span className="flex items-center gap-1 truncate">
                {conventionalCommit.type && <CommitTypeBadge type={conventionalCommit.type} />}
                <span className="truncate">{conventionalCommit.message ?? "Untitled Version"}</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={toggleChatVisibility}
                aria-label={isChatVisible ? "Hide chat" : "Show chat"}
              >
                {isChatVisible ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronUpIcon className="size-4" />
                )}
              </Button>
              <TimelineTrigger />
            </div>
          </div>
        </Timeline>

        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            height: !isChatVisible
              ? 0
              : `calc(100vh - ${
                  274 +
                  (status !== "idle" ? 24 : 0) +
                  (attachments.length > 0 ? 74 : 0) +
                  (isTimelineOpen ? 146 : 0)
                }px)`,
          }}
        >
          <div
            ref={messagesContainerRef}
            className="scrollbar-thumb-rounded-full scrollbar flex h-full flex-col gap-2 overflow-y-auto border-b p-2 scrollbar-thumb-muted-foreground scrollbar-track-transparent"
          >
            <Messages
              messages={messages}
              branchId={branch.id}
              project={project}
              integrationTemplates={integrationTemplates}
              environmentVariables={environmentVariables}
              setMessages={setMessages}
              setStatus={setStatus}
            />
            <div ref={messagesEndRef} />
          </div>
        </div>

        <MultimodalInput
          type="editor"
          session={session}
          chatId={chat?.id ?? ""}
          message={userMessageContent}
          setMessage={setUserMessageContent}
          attachments={attachments}
          setAttachments={setAttachments}
          status={status}
          handleSubmit={handleSubmit}
          placeholder="Build with Weldr..."
          references={editorReferences}
          onFocus={handleInputFocus}
        />
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (!equal(prevProps.environmentVariables, nextProps.environmentVariables)) return false;
    if (prevProps.project.id !== nextProps.project.id) return false;
    if (prevProps.branch.id !== nextProps.branch.id) return false;
    if (prevProps.branch.name !== nextProps.branch.name) return false;
    const prevSnapshot = prevProps.branch.snapshot;
    const nextSnapshot = nextProps.branch.snapshot;
    if (prevSnapshot?.id !== nextSnapshot?.id) return false;
    if (prevSnapshot?.title !== nextSnapshot?.title) return false;
    if (prevSnapshot?.description !== nextSnapshot?.description) return false;
    if (prevProps.integrationTemplates.length !== nextProps.integrationTemplates.length)
      return false;
    return true;
  },
);
