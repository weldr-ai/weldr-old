import equal from "fast-deep-equal";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { authClient } from "@weldr/auth/client";
import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useEditorReferences } from "@/hooks/use-editor-references";
import { useEventStream } from "@/hooks/use-event-stream";
import { useMessages } from "@/hooks/use-messages";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useStatus } from "@/hooks/use-status";
import { useWorkflowTrigger } from "@/hooks/use-workflow-trigger";
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

    const versionToUse = branch.selectedVersion ?? branch.headVersion;

    const {
      messages,
      setMessages,
      userMessageContent,
      setUserMessageContent,
      attachments,
      setAttachments,
      handleSubmit: handleMessageSubmit,
    } = useMessages({
      initialMessages: versionToUse.chat.messages,
      chatId: versionToUse.chat.id,
      session,
    });

    const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>(messages);

    const { status, setStatus } = useStatus({
      version: versionToUse,
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
      chatId: versionToUse.chat.id,
      branch,
      setStatus,
      setMessages,
    });

    const { triggerGeneration } = useWorkflowTrigger({
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
        await triggerGeneration({
          content: userMessageContent,
          attachmentIds: attachments.map((attachment) => attachment.id),
        });
      } finally {
        // Reset the flag after a short delay
        setTimeout(() => {
          isSubmittingRef.current = false;
        }, 500);
      }
    }, [handleMessageSubmit, triggerGeneration, userMessageContent, attachments]);

    const editorReferences = useEditorReferences({
      version: versionToUse,
    });

    useEffect(() => {
      return () => {
        closeEventStream();
      };
    }, [closeEventStream]);

    const conventionalCommit = parseConventionalCommit(versionToUse.message);

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
              <span className="text-muted-foreground">{`#${versionToUse.sequenceNumber}`}</span>
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
          chatId={versionToUse.chat.id}
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
    // Check if selectedVersion changed
    const prevVersion = prevProps.branch.selectedVersion ?? prevProps.branch.headVersion;
    const nextVersion = nextProps.branch.selectedVersion ?? nextProps.branch.headVersion;
    if (prevVersion.id !== nextVersion.id) return false;
    // Check if version message or description changed (streamed from generate-version-details step)
    if (prevVersion.message !== nextVersion.message) return false;
    if (prevVersion.description !== nextVersion.description) return false;
    if (prevProps.integrationTemplates.length !== nextProps.integrationTemplates.length)
      return false;
    return true;
  },
);
