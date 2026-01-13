import type {
  AssistantModelMessage,
  DataContent,
  FilePart,
  ImagePart,
  JSONValue,
  ModelMessage,
  TextPart,
  ToolCallPart,
  ToolContent,
  ToolResultPart,
  UserModelMessage,
} from "ai";

import { db, eq } from "@weldr/db";
import { declarations } from "@weldr/db/schema";
import { processText } from "@weldr/shared/process-text";
import type { ChatMessage } from "@weldr/shared/types";

import { formatDeclarationSpecs } from "@/core/project/declarations";

export async function convertMessages(messages: ChatMessage[]) {
  const result: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "tool") {
      result.push({
        role: "tool",
        content: message.content.reduce((acc: ToolContent, c) => {
          if (c.type === "tool-result") {
            acc.push({
              type: "tool-result",
              toolName: c.toolName,
              toolCallId: c.toolCallId,
              output: {
                type: "json",
                value: c.output as JSONValue,
              },
            });
          }
          return acc;
        }, []),
      });
      continue;
    }

    const parts = message.content ?? [];

    const messageContent: (TextPart | FilePart | ImagePart | ToolCallPart | ToolResultPart)[] = [];

    let currentTextContent = "";

    const flushTextContent = () => {
      if (currentTextContent.trim()) {
        messageContent.push({
          type: "text",
          text: currentTextContent,
        } satisfies TextPart);
        currentTextContent = "";
      }
    };

    for (const part of parts) {
      if (part.type === "text") {
        const processed = processText(part.text);
        for (const p of processed) {
          if (p.type === "text") {
            currentTextContent += p.text;
          }
          if (p.type === "db-model" || p.type === "page" || p.type === "endpoint") {
            const reference = await db.query.declarations.findFirst({
              where: eq(declarations.id, p.id),
            });
            if (reference) {
              currentTextContent += formatDeclarationSpecs(reference);
            }
          }
        }
      }

      if (part.type === "file") {
        flushTextContent();
        messageContent.push({
          type: "file",
          data: part.data,
          mediaType: part.mediaType,
        });
      }

      if (part.type === "image") {
        flushTextContent();
        messageContent.push({
          type: "image",
          image: part.image as URL | DataContent,
          mediaType: part.mediaType,
        });
      }

      if (part.type === "tool-call") {
        flushTextContent();
        messageContent.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      }
    }

    flushTextContent();

    if (messageContent.length > 0) {
      if (message.role === "user") {
        result.push({
          role: "user",
          content: messageContent as UserModelMessage["content"],
        });
      } else {
        result.push({
          role: "assistant",
          content: messageContent as AssistantModelMessage["content"],
        });
      }
    }
  }

  return result;
}
