import { useQueryClient } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { RouterOutputs } from "@weldr/api";
import type {
  AssistantMessage,
  ChatMessage,
  NodeType,
  SSEEvent,
  TStatus,
} from "@weldr/shared/types";

import { useTRPC } from "@/lib/trpc/react";
import type { CanvasNode } from "@/types";

interface UseEventStreamOptions {
  projectId: string;
  branchId: string;
  chatId: string;
  branch: RouterOutputs["branches"]["byIdOrMain"];
  setStatus: (status: TStatus) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useEventStream({
  projectId,
  branchId,
  chatId,
  branch,
  setStatus,
  setMessages,
}: UseEventStreamOptions) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { getNodes, setNodes, updateNodeData } = useReactFlow<CanvasNode>();

  // Use ref instead of state to avoid triggering re-renders and dependency issues
  const eventSourceRef = useRef<EventSource | null>(null);

  // Reconnection tracking
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const lastEventIdRef = useRef<string | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const setStatusRef = useRef(setStatus);
  const setMessagesRef = useRef(setMessages);

  useEffect(() => {
    setStatusRef.current = setStatus;
    setMessagesRef.current = setMessages;
  }, [setStatus, setMessages]);

  const connectToEventStream = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (eventSourceRef.current || isConnectingRef.current) {
      return eventSourceRef.current;
    }

    // Mark as connecting to prevent race conditions
    isConnectingRef.current = true;

    // Clear any pending reconnection timeout before creating new connection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Build URL with branchId in path and Last-Event-ID as query parameter
    let url = `/api/chat/${projectId}/${branchId}/stream`;
    if (lastEventIdRef.current) {
      url += `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        // EventSource API should give us clean JSON data directly
        const chunk: SSEEvent = JSON.parse(event.data);

        if (chunk.type === "connected") {
          reconnectAttempts.current = 0;
          isConnectingRef.current = false;
          console.log(`[SSE] Connected to stream for project ${projectId}`);
          return;
        }

        // Track the event ID if present for reconnection
        if (chunk.id) {
          lastEventIdRef.current = chunk.id;
        }

        if (chunk.type === "error") {
          setStatusRef.current(null);
          if (eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
          }
          eventSourceRef.current = null;
          reconnectAttempts.current = 0;
          isConnectingRef.current = false;
          return;
        }

        setStatusRef.current("responding");

        switch (chunk.type) {
          case "status": {
            setStatusRef.current(chunk.status);
            break;
          }
          case "text": {
            setMessagesRef.current((prevMessages) => {
              const lastMessage = prevMessages[prevMessages.length - 1];

              // Only append to the last message if it's an assistant message with the same ID
              if (lastMessage?.role === "assistant" && lastMessage.id === chunk.id) {
                const messagesWithoutLast = prevMessages.slice(0, -1);
                const updatedContent = [...lastMessage.content];
                const lastContentItem = updatedContent[updatedContent.length - 1];

                if (lastContentItem && lastContentItem.type === "text") {
                  updatedContent[updatedContent.length - 1] = {
                    ...lastContentItem,
                    text: lastContentItem.text + chunk.text,
                  };
                } else {
                  updatedContent.push({
                    type: "text",
                    text: chunk.text,
                  });
                }

                const updatedLastMessage = {
                  ...lastMessage,
                  content: updatedContent as AssistantMessage["content"],
                };
                return [...messagesWithoutLast, updatedLastMessage];
              }

              // Create a new assistant message if no matching message exists
              return [
                ...prevMessages,
                {
                  id: chunk.id,
                  role: "assistant",
                  chatId,
                  createdAt: new Date(),
                  content: [
                    {
                      type: "text",
                      text: chunk.text,
                    },
                  ],
                },
              ];
            });
            break;
          }
          case "tool-call": {
            console.log("tool-call", chunk);
            setMessagesRef.current((prevMessages) => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage?.id === chunk.id) {
                const chatWithLastMessage = prevMessages.slice(0, -1);
                return [
                  ...chatWithLastMessage,
                  {
                    id: chunk.id,
                    role: "assistant",
                    createdAt: lastMessage.createdAt,
                    chatId: lastMessage.chatId,
                    content: [
                      ...(lastMessage.content.filter(
                        (content) =>
                          content.type !== "tool-call" || content.toolCallId !== chunk.toolCallId,
                      ) as AssistantMessage["content"]),
                      {
                        type: "tool-call",
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                      },
                    ],
                  },
                ];
              }
              return [
                ...prevMessages,
                {
                  id: chunk.id,
                  role: "assistant",
                  createdAt: new Date(),
                  chatId,
                  content: [
                    {
                      type: "tool-call",
                      toolCallId: chunk.toolCallId,
                      toolName: chunk.toolName,
                      input: chunk.input,
                    },
                  ],
                },
              ];
            });
            break;
          }
          case "tool": {
            setMessagesRef.current((prevMessages) => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage?.role === "tool") {
                const integrationToolResult = chunk.message.content.find(
                  (content) =>
                    content.type === "tool-result" && content.toolName === "add_integrations",
                );
                if (integrationToolResult) {
                  const chatWithLastMessage = prevMessages.slice(0, -1);
                  return [...chatWithLastMessage, chunk.message as ChatMessage];
                }
              }
              return [...prevMessages, chunk.message as ChatMessage];
            });
            break;
          }
          case "update_project": {
            // Update the project data in the query cache
            queryClient.setQueryData(trpc.projects.byId.queryKey({ id: projectId }), (old) => {
              if (!old) return old;
              return {
                ...old,
                title: chunk.data.title,
                description: chunk.data.description,
              };
            });

            // Invalidate the query to ensure the data is fresh
            queryClient.invalidateQueries({
              queryKey: trpc.projects.byId.queryKey({ id: projectId }),
            });

            break;
          }
          case "update_branch": {
            queryClient.setQueryData(
              trpc.branches.byIdOrMain.queryKey({ id: branchId, projectId }),
              (old) => {
                if (!old) return old;
                const updatedBranch = {
                  ...old,
                  ...chunk.data,
                  headVersion: {
                    ...old.headVersion,
                    ...chunk.data.headVersion,
                  },
                };
                // Ensure branch name is updated if provided
                if ("name" in chunk.data && chunk.data.name !== undefined) {
                  updatedBranch.name = chunk.data.name as string;
                }
                // Ensure version message is updated if provided
                if (chunk.data.headVersion?.message !== undefined) {
                  updatedBranch.headVersion.message = chunk.data.headVersion.message;
                }
                return updatedBranch;
              },
            );

            queryClient.invalidateQueries({
              queryKey: trpc.branches.byIdOrMain.queryKey({
                id: branchId,
                projectId,
              }),
            });

            // Use the status from the updated branch data if available
            const updatedStatus = chunk.data.headVersion?.status ?? branch.headVersion.status;

            switch (updatedStatus) {
              case "planning":
                setStatusRef.current("planning");
                break;
              case "coding":
                setStatusRef.current("coding");
                break;
              case "finalizing":
                setStatusRef.current("finalizing");
                break;
              case "completed":
              case "failed":
                setStatusRef.current(null);
                break;
              default:
                setStatusRef.current(null);
                break;
            }
            break;
          }
          case "node": {
            const nodes = getNodes();
            const existingNode = nodes.find((n) => n.id === chunk.nodeId);

            if (existingNode) {
              updateNodeData(existingNode.id, {
                ...existingNode.data,
                metadata: chunk.metadata,
                progress: chunk.progress,
              });
            } else {
              if (!chunk.metadata) {
                throw new Error(`[chat:${projectId}] No specs found for node ${chunk.nodeId}`);
              }

              const newNode = {
                id: chunk.nodeId,
                type: chunk.metadata.specs?.type as NodeType,
                position: chunk.position,
                data: {
                  id: chunk.nodeId,
                  metadata: chunk.metadata,
                  progress: chunk.progress,
                  nodeId: chunk.nodeId,
                  node: chunk.node,
                },
              } satisfies CanvasNode;

              setNodes((prevNodes: CanvasNode[]) => [...prevNodes, newNode as CanvasNode]);
            }
            break;
          }
          case "end": {
            setStatusRef.current(null);
            return;
          }
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);

      // Clear connecting flag
      isConnectingRef.current = false;

      // Ensure connection is properly closed and state is cleaned up
      if (eventSource.readyState !== EventSource.CLOSED) {
        eventSource.close();
      }
      eventSourceRef.current = null;

      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Only retry if workflow is still active and we haven't exceeded max attempts
      if (
        branch.headVersion.status !== "completed" &&
        branch.headVersion.status !== "failed" &&
        reconnectAttempts.current < maxReconnectAttempts
      ) {
        reconnectAttempts.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 10000); // Exponential backoff with max 10s

        reconnectTimeoutRef.current = setTimeout(() => {
          connectToEventStream();
        }, delay);
      } else {
        setStatusRef.current(null);
      }
    };

    return eventSource;
  }, [
    projectId,
    branchId,
    branch.headVersion.status,
    getNodes,
    setNodes,
    updateNodeData,
    queryClient,
    chatId,
    trpc,
  ]);

  const closeEventStream = useCallback(() => {
    // Reset reconnection attempts and connecting flag
    reconnectAttempts.current = 0;
    isConnectingRef.current = false;

    // Clear any pending timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close EventSource connection if it exists and is not already closed
    if (eventSourceRef.current) {
      if (eventSourceRef.current.readyState !== EventSource.CLOSED) {
        eventSourceRef.current.close();
      }
      eventSourceRef.current = null;
    }
  }, []);

  // Handle chatId changes (e.g., when version changes)
  useEffect(() => {
    // Close existing connection when chatId changes
    closeEventStream();
    // Reset last event ID since we're switching to a different chat
    lastEventIdRef.current = null;
  }, [chatId, closeEventStream]);

  // Auto-connect to event stream on mount if workflow is active
  useEffect(() => {
    // Only connect if there's no existing connection and workflow might be active
    if (
      !eventSourceRef.current &&
      branch.headVersion.status !== "completed" &&
      branch.headVersion.status !== "failed"
    ) {
      connectToEventStream();
    }
  }, [branch.headVersion.status, connectToEventStream, chatId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeEventStream();
    };
  }, [closeEventStream]);

  return {
    eventSourceRef: eventSourceRef.current,
    connectToEventStream,
    closeEventStream,
  };
}
