import { type RefObject, useEffect, useRef } from "react";

import type { ChatMessage } from "@weldr/shared/types";

export function useScrollToBottom<T extends HTMLElement>(
  messages: ChatMessage[],
): [RefObject<T | null>, RefObject<T | null>] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);

  const scrollToBottom = () => {
    const end = endRef.current;
    if (end) {
      end.scrollIntoView({ behavior: "instant", block: "end" });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      // Initial scroll to bottom when the hook is first set up
      scrollToBottom();

      const observer = new MutationObserver(() => {
        scrollToBottom();
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      return () => observer.disconnect();
    }
  }, [messages]);

  return [containerRef, endRef];
}
