import type { TextPart } from "ai";
import type { z } from "zod";

import type { referencePartSchema } from "./validators/chats";

export function processText(content: string): (z.infer<typeof referencePartSchema> | TextPart)[] {
  const parts: (z.infer<typeof referencePartSchema> | TextPart)[] = [];
  let lastIndex = 0;

  // Regex to match <Reference ... /> tags
  const referenceRegex = /<Reference\s+([^>]+?)\s*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = referenceRegex.exec(content)) !== null) {
    // Add any text before the reference as a text part
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({
          type: "text",
          text: textBefore,
        } satisfies TextPart);
      }
    }

    // Parse the reference attributes
    // oxlint-disable-next-line no-non-null-assertion
    const attributesString = match[1]!;
    const attributes: Record<string, string> = {};

    // Match attribute="value" or attribute='value' patterns
    const attrRegex = /(\w+)=["']([^"']+)["']/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attributesString)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // Create the appropriate reference part based on type
    if (attributes.type && attributes.id) {
      if (attributes.type === "db-model") {
        parts.push({
          type: "db-model",
          id: attributes.id,
          name: attributes.name || "",
        } satisfies z.infer<typeof referencePartSchema>);
      } else if (attributes.type === "page") {
        parts.push({
          type: "page",
          id: attributes.id,
          name: attributes.name || "",
        } satisfies z.infer<typeof referencePartSchema>);
      } else if (attributes.type === "endpoint" && attributes.method && attributes.path) {
        parts.push({
          type: "endpoint",
          id: attributes.id,
          method: attributes.method,
          path: attributes.path,
        } satisfies z.infer<typeof referencePartSchema>);
      } else {
        // If type is unrecognized or missing required fields, treat as text
        parts.push({
          type: "text",
          text: match[0],
        } satisfies TextPart);
      }
    } else {
      // If required attributes are missing, treat as text
      parts.push({
        type: "text",
        text: match[0],
      } satisfies TextPart);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last reference
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex);
    if (remainingText.trim()) {
      parts.push({
        type: "text",
        text: remainingText,
      } satisfies TextPart);
    }
  }

  // If no parts were created and there's content, return it as a single text part
  if (parts.length === 0 && content.trim()) {
    parts.push({
      type: "text",
      text: content,
    } satisfies TextPart);
  }

  return parts;
}

export function parseReferences(content: string): z.infer<typeof referencePartSchema>[] {
  const references: z.infer<typeof referencePartSchema>[] = [];

  // Regex to match <Reference ... /> tags
  const referenceRegex = /<Reference\s+([^>]+?)\s*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = referenceRegex.exec(content)) !== null) {
    // Parse the reference attributes
    // oxlint-disable-next-line no-non-null-assertion
    const attributesString = match[1]!;
    const attributes: Record<string, string> = {};

    // Match attribute="value" or attribute='value' patterns
    const attrRegex = /(\w+)=["']([^"']+)["']/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attributesString)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // Create the appropriate reference part based on type
    if (attributes.type && attributes.id) {
      if (attributes.type === "db-model") {
        references.push({
          type: "db-model",
          id: attributes.id,
          name: attributes.name || "",
        } satisfies z.infer<typeof referencePartSchema>);
      } else if (attributes.type === "page") {
        references.push({
          type: "page",
          id: attributes.id,
          name: attributes.name || "",
        } satisfies z.infer<typeof referencePartSchema>);
      } else if (attributes.type === "endpoint" && attributes.method && attributes.path) {
        references.push({
          type: "endpoint",
          id: attributes.id,
          method: attributes.method,
          path: attributes.path,
        } satisfies z.infer<typeof referencePartSchema>);
      }
    }
  }

  return references;
}

export function preprocessReferences(content: string): string {
  return content.replace(
    /<Reference\s+([^>]+?)\s*\/>/g,
    (match: string, attributesString: string): string => {
      const attributes: Record<string, string> = {};

      // Match attribute="value" or attribute='value' patterns
      const attrRegex = /(\w+)=["']([^"']+)["']/g;
      // oxlint-disable-next-line no-implicit-any
      let attrMatch;

      attrMatch = attrRegex.exec(attributesString);
      while (attrMatch !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
        attrMatch = attrRegex.exec(attributesString);
      }

      // Only process if we have at least type and id
      if (attributes.type && attributes.id) {
        const props = {
          type: attributes.type,
          id: attributes.id,
          name: attributes.name,
          method: attributes.method,
          path: attributes.path,
        };
        return `%%REFERENCE:${btoa(encodeURIComponent(JSON.stringify(props)))}%%`;
      }

      // If required attributes are missing, return the original match
      return match;
    },
  );
}
