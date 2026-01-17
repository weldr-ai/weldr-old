import equal from "fast-deep-equal";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { authClient } from "@weldr/auth/client";
import type { ChatMessage } from "@weldr/shared/types";
import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useEditorReferences } from "@/hooks/use-editor-references";
import { useEventStream } from "@/hooks/use-event-stream";
import { useMessages } from "@/hooks/use-messages";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useSession } from "@/hooks/use-session";
import { useStatus } from "@/hooks/use-status";
import { parseConventionalCommit } from "@/lib/utils";
import { CommitTypeBadge } from "../commit-type-badge";
import { Timeline, TimelineContent, TimelineTrigger } from "../timeline";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input/multimodal-input";

interface ChatProps {
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  project: RouterOutputs["projects"]["byId"];
  branch: RouterOutputs["branches"]["byIdOrMain"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}

export const Chat = memo<ChatProps>(
  ({ integrationTemplates, project, branch, environmentVariables }) => {
    const { data: session } = authClient.useSession();

    // Get the first (most recent) chat from the branch
    const chat = branch.chats?.[0];
    const snapshot = branch.snapshot;

    const {
      messages,
      setMessages,
      userMessageContent,
      setUserMessageContent,
      attachments,
      setAttachments,
      handleSubmit: handleMessageSubmit,
    } = useMessages({
      initialMessages: (chat?.messages ?? []) as ChatMessage[],
      chatId: chat?.id ?? "",
      session,
    });

    const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>(messages);

    const { status, setStatus } = useStatus({
      messages,
      project,
    });

    const { isChatVisible, chatContainerRef, handleInputFocus, toggleChatVisibility } =
      useChatVisibility();

    const [isTimelineOpen, setIsTimelineOpen] = useState(true);

    // Track if we're currently submitting to prevent double submissions
    const isSubmittingRef = useRef(false);

    const { eventSourceRef, connectToEventStream, closeEventStream } = useEventStream({
      projectId: project.id,
      branchId: branch.id,
      chatId: chat?.id ?? "",
      setStatus,
      setMessages,
    });

    const { sendMessage } = useSession({
      projectId: project.id,
      branchId: branch.id,
      setStatus,
      eventSourceRef,
      connectToEventStream,
    });

    const handleSubmit = useCallback(async () => {
      // Prevent double submissions
      if (isSubmittingRef.current) {
        return;
      }

      isSubmittingRef.current = true;

      try {
        await handleMessageSubmit();
        await sendMessage({
          content: userMessageContent,
          attachmentIds: attachments.map((attachment) => attachment.id),
        });
      } finally {
        // Reset the flag after a short delay
        setTimeout(() => {
          isSubmittingRef.current = false;
        }, 500);
      }
    }, [handleMessageSubmit, sendMessage, userMessageContent, attachments]);

    const editorReferences = useEditorReferences({
      snapshot,
    });

    useEffect(() => {
      return () => {
        closeEventStream();
      };
    }, [closeEventStream]);

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
                  274 + // Base offset
                  (status ? 24 : 0) + // Status bar
                  (attachments.length > 0 ? 74 : 0) + // Attachments
                  (isTimelineOpen ? 146 : 0) // Timeline
                }px)`,
          }}
        >
          <div
            ref={messagesContainerRef}
            className="scrollbar scrollbar-thumb-rounded-full scrollbar-thumb-muted-foreground scrollbar-track-transparent flex h-full flex-col gap-2 overflow-y-auto border-b p-2"
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
    // Check if environmentVariables changed
    if (!equal(prevProps.environmentVariables, nextProps.environmentVariables)) return false;
    // Check other props with shallow comparison
    if (prevProps.project.id !== nextProps.project.id) return false;
    if (prevProps.branch.id !== nextProps.branch.id) return false;
    // Check if branch name changed (streamed from generate-branch-name step)
    if (prevProps.branch.name !== nextProps.branch.name) return false;
    // Check if snapshot changed
    const prevSnapshot = prevProps.branch.snapshot;
    const nextSnapshot = nextProps.branch.snapshot;
    if (prevSnapshot?.id !== nextSnapshot?.id) return false;
    // Check if snapshot title or description changed (streamed from generate-snapshot-details step)
    if (prevSnapshot?.title !== nextSnapshot?.title) return false;
    if (prevSnapshot?.description !== nextSnapshot?.description) return false;
    if (prevProps.integrationTemplates.length !== nextProps.integrationTemplates.length)
      return false;
    return true;
  },
);
