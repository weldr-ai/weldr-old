import { useCallback, useRef } from "react";

import type { TriggerWorkflowResponse, TStatus, UserMessage } from "@weldr/shared/types";

interface UseWorkflowTriggerOptions {
  projectId: string;
  branchId: string;
  setStatus: (status: TStatus) => void;
  eventSourceRef: EventSource | null;
  connectToEventStream: () => EventSource | null;
}

export function useWorkflowTrigger({
  projectId,
  branchId,
  setStatus,
  eventSourceRef,
  connectToEventStream,
}: UseWorkflowTriggerOptions) {
  // Use refs to avoid recreating triggerGeneration when eventSourceRef changes
  const eventSourceRefValue = useRef(eventSourceRef);
  const connectToEventStreamRef = useRef(connectToEventStream);

  // Track if we're currently triggering to prevent double triggers
  const isTriggeringRef = useRef(false);

  // Update refs when values change
  eventSourceRefValue.current = eventSourceRef;
  connectToEventStreamRef.current = connectToEventStream;

  const triggerWorkflow = useCallback(
    async (message?: { content: UserMessage["content"]; attachmentIds?: string[] }) => {
      try {
        const triggerResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: "/trigger",
            projectId,
            branchId,
            message,
          }),
        });

        if (!triggerResponse.ok) {
          throw new Error("Failed to trigger workflow");
        }

        const triggerResult: TriggerWorkflowResponse = await triggerResponse.json();
        return triggerResult;
      } catch (error) {
        console.error("Failed to trigger workflow:", error);
        throw error;
      }
    },
    [projectId, branchId],
  );

  const triggerGeneration = useCallback(
    async (message?: { content: UserMessage["content"]; attachmentIds?: string[] }) => {
      // Prevent multiple simultaneous triggers
      if (isTriggeringRef.current) {
        console.warn("Trigger already in progress, ignoring duplicate request");
        return;
      }

      isTriggeringRef.current = true;
      setStatus("thinking");

      try {
        // First trigger the workflow
        await triggerWorkflow(message);

        // Only connect to event stream if we don't already have a connection
        if (!eventSourceRefValue.current) {
          connectToEventStreamRef.current();
        }
      } catch (error) {
        console.error("Failed to start generation:", error);
        setStatus(null);
      } finally {
        // Reset trigger flag after a short delay to prevent rapid double-clicks
        setTimeout(() => {
          isTriggeringRef.current = false;
        }, 1000);
      }
    },
    [triggerWorkflow, setStatus],
  );

  return {
    triggerWorkflow,
    triggerGeneration,
  };
}
