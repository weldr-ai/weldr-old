import { useCallback, useRef } from "react";

import type { SessionResponse, TStatus, UserMessage } from "@weldr/shared/types";

interface UseSessionOptions {
  projectId: string;
  branchId: string;
  setStatus: (status: TStatus) => void;
  eventSourceRef: EventSource | null;
  connectToEventStream: () => EventSource | null;
}

export function useSession({
  projectId,
  branchId,
  setStatus,
  eventSourceRef,
  connectToEventStream,
}: UseSessionOptions) {
  // Use refs to avoid recreating sendMessage when eventSourceRef changes
  const eventSourceRefValue = useRef(eventSourceRef);
  const connectToEventStreamRef = useRef(connectToEventStream);

  // Track if we're currently starting a session to prevent double triggers
  const isStartingRef = useRef(false);

  // Update refs when values change
  eventSourceRefValue.current = eventSourceRef;
  connectToEventStreamRef.current = connectToEventStream;

  const startSession = useCallback(
    async (message?: { content: UserMessage["content"]; attachmentIds?: string[] }) => {
      try {
        const response = await fetch("/api/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: "/session",
            projectId,
            branchId,
            message,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start session");
        }

        const result: SessionResponse = await response.json();
        return result;
      } catch (error) {
        console.error("Failed to start session:", error);
        throw error;
      }
    },
    [projectId, branchId],
  );

  const sendMessage = useCallback(
    async (message?: { content: UserMessage["content"]; attachmentIds?: string[] }) => {
      // Prevent multiple simultaneous session starts
      if (isStartingRef.current) {
        console.warn("Session start already in progress, ignoring duplicate request");
        return;
      }

      isStartingRef.current = true;
      setStatus("thinking");

      try {
        // Start the session
        await startSession(message);

        // Only connect to event stream if we don't already have a connection
        if (!eventSourceRefValue.current) {
          connectToEventStreamRef.current();
        }
      } catch (error) {
        console.error("Failed to send message:", error);
        setStatus(null);
      } finally {
        // Reset flag after a short delay to prevent rapid double-clicks
        setTimeout(() => {
          isStartingRef.current = false;
        }, 1000);
      }
    },
    [startSession, setStatus],
  );

  return {
    startSession,
    sendMessage,
  };
}
