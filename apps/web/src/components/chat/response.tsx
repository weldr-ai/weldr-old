import hardenReactMarkdown from "harden-react-markdown";
import React, { type ComponentProps, type HTMLAttributes, memo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { z } from "zod";

import type { referencePartSchema } from "@weldr/shared/validators/chats";
import { cn } from "@weldr/ui/lib/utils";

import { ReferenceBadge } from "@/components/chat/editor/reference-badge";

/**
 * Parses markdown text and removes incomplete tokens to prevent partial rendering
 * of links, images, bold, and italic formatting during streaming.
 */
function parseIncompleteMarkdown(text: string): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;

  // Handle incomplete links and images
  // Pattern: [...] or ![...] where the closing ] is missing
  const linkImagePattern = /(!?\[)([^\]]*?)$/;
  const linkMatch = result.match(linkImagePattern);
  if (linkMatch) {
    // If we have an unterminated [ or ![, remove it and everything after
    // oxlint-disable-next-line no-non-null-assertion
    const startIndex = result.lastIndexOf(linkMatch[1]!);
    result = result.substring(0, startIndex);
  }

  // Handle incomplete bold formatting (**)
  const boldPattern = /(\*\*)([^*]*?)$/;
  const boldMatch = result.match(boldPattern);
  if (boldMatch) {
    // Count the number of ** in the entire string
    const asteriskPairs = (result.match(/\*\*/g) || []).length;
    // If odd number of **, we have an incomplete bold - complete it
    if (asteriskPairs % 2 === 1) {
      result = `${result}**`;
    }
  }

  // Handle incomplete italic formatting (__)
  const italicPattern = /(__)([^_]*?)$/;
  const italicMatch = result.match(italicPattern);
  if (italicMatch) {
    // Count the number of __ in the entire string
    const underscorePairs = (result.match(/__/g) || []).length;
    // If odd number of __, we have an incomplete italic - complete it
    if (underscorePairs % 2 === 1) {
      result = `${result}__`;
    }
  }

  // Handle incomplete single asterisk italic (*)
  const singleAsteriskPattern = /(\*)([^*]*?)$/;
  const singleAsteriskMatch = result.match(singleAsteriskPattern);
  if (singleAsteriskMatch) {
    // Count single asterisks that aren't part of **
    const singleAsterisks = result.split("").reduce((acc, char, index) => {
      if (char === "*") {
        // Check if it's part of a ** pair
        const prevChar = result[index - 1];
        const nextChar = result[index + 1];
        if (prevChar !== "*" && nextChar !== "*") {
          return acc + 1;
        }
      }
      return acc;
    }, 0);

    // If odd number of single *, we have an incomplete italic - complete it
    if (singleAsterisks % 2 === 1) {
      result = `${result}*`;
    }
  }

  // Handle incomplete single underscore italic (_)
  const singleUnderscorePattern = /(_)([^_]*?)$/;
  const singleUnderscoreMatch = result.match(singleUnderscorePattern);
  if (singleUnderscoreMatch) {
    // Count single underscores that aren't part of __
    const singleUnderscores = result.split("").reduce((acc, char, index) => {
      if (char === "_") {
        // Check if it's part of a __ pair
        const prevChar = result[index - 1];
        const nextChar = result[index + 1];
        if (prevChar !== "_" && nextChar !== "_") {
          return acc + 1;
        }
      }
      return acc;
    }, 0);

    // If odd number of single _, we have an incomplete italic - complete it
    if (singleUnderscores % 2 === 1) {
      result = `${result}_`;
    }
  }

  // Handle incomplete strikethrough formatting (~~)
  const strikethroughPattern = /(~~)([^~]*?)$/;
  const strikethroughMatch = result.match(strikethroughPattern);
  if (strikethroughMatch) {
    // Count the number of ~~ in the entire string
    const tildePairs = (result.match(/~~/g) || []).length;
    // If odd number of ~~, we have an incomplete strikethrough - complete it
    if (tildePairs % 2 === 1) {
      result = `${result}~~`;
    }
  }

  return result;
}

export function processReferences(text: string): React.ReactNode {
  const parts = text.split(/%%REFERENCE:([A-Za-z0-9+/=]+)%%/);

  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, index) => {
    // Even indices are regular text
    if (index % 2 === 0) {
      return part || null;
    }

    // Odd indices are encoded reference data
    const props = JSON.parse(decodeURIComponent(atob(part)));
    if (!props) return null;

    const reference: z.infer<typeof referencePartSchema> = {
      type: props.type,
      id: props.id,
      name: props.name,
      path: props.path,
      method: props.method,
    };

    return <ReferenceBadge key={`ref-${index}`} reference={reference} />;
  });
}

export function processChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return processReferences(child);
    }
    // For React elements with children, recursively process them
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children) {
      return React.cloneElement(child, {
        ...child.props,
        children: processChildren(child.props.children),
      });
    }
    return child;
  });
}

const components: Options["components"] = {
  // Custom text renderer to handle reference markers
  p: ({ children, className, ...props }) => (
    <p className={cn("", className)} {...props}>
      {processChildren(children)}
    </p>
  ),
  ol: ({ children, className, ...props }) => (
    <ol className={cn("ml-4 list-outside list-decimal", className)} {...props}>
      {processChildren(children)}
    </ol>
  ),
  li: ({ children, className, ...props }) => (
    <li className={cn("py-1", className)} {...props}>
      {processChildren(children)}
    </li>
  ),
  ul: ({ children, className, ...props }) => (
    <ul className={cn("ml-4 list-outside list-disc", className)} {...props}>
      {processChildren(children)}
    </ul>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-6 border-border", className)} {...props} />
  ),
  strong: ({ children, className, ...props }) => (
    <span className={cn("font-semibold", className)} {...props}>
      {processChildren(children)}
    </span>
  ),
  a: ({ children, className, ...props }) => (
    <a
      className={cn("font-medium text-primary underline", className)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {processChildren(children)}
    </a>
  ),
  h1: ({ children, className, ...props }) => (
    <h1 className={cn("mt-6 mb-2 text-3xl font-semibold", className)} {...props}>
      {processChildren(children)}
    </h1>
  ),
  h2: ({ children, className, ...props }) => (
    <h2 className={cn("mt-6 mb-2 text-2xl font-semibold", className)} {...props}>
      {processChildren(children)}
    </h2>
  ),
  h3: ({ children, className, ...props }) => (
    <h3 className={cn("mt-6 mb-2 text-xl font-semibold", className)} {...props}>
      {processChildren(children)}
    </h3>
  ),
  h4: ({ children, className, ...props }) => (
    <h4 className={cn("mt-6 mb-2 text-lg font-semibold", className)} {...props}>
      {processChildren(children)}
    </h4>
  ),
  h5: ({ children, className, ...props }) => (
    <h5 className={cn("mt-6 mb-2 text-base font-semibold", className)} {...props}>
      {processChildren(children)}
    </h5>
  ),
  h6: ({ children, className, ...props }) => (
    <h6 className={cn("mt-6 mb-2 text-sm font-semibold", className)} {...props}>
      {processChildren(children)}
    </h6>
  ),
  table: ({ children, className, ...props }) => (
    <div className="my-4 overflow-x-auto">
      <table className={cn("w-full border-collapse border border-border", className)} {...props}>
        {processChildren(children)}
      </table>
    </div>
  ),
  thead: ({ children, className, ...props }) => (
    <thead className={cn("bg-muted/50", className)} {...props}>
      {processChildren(children)}
    </thead>
  ),
  tbody: ({ children, className, ...props }) => (
    <tbody className={cn("divide-y divide-border", className)} {...props}>
      {processChildren(children)}
    </tbody>
  ),
  tr: ({ children, className, ...props }) => (
    <tr className={cn("border-b border-border", className)} {...props}>
      {processChildren(children)}
    </tr>
  ),
  th: ({ children, className, ...props }) => (
    <th className={cn("px-4 py-2 text-left text-sm font-semibold", className)} {...props}>
      {processChildren(children)}
    </th>
  ),
  td: ({ children, className, ...props }) => (
    <td className={cn("px-4 py-2 text-sm", className)} {...props}>
      {processChildren(children)}
    </td>
  ),
  blockquote: ({ children, className, ...props }) => (
    <blockquote
      className={cn(
        "my-4 border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground italic",
        className,
      )}
      {...props}
    >
      {processChildren(children)}
    </blockquote>
  ),
  code: ({ node, className, ...props }) => {
    const inline = node?.position?.start.line === node?.position?.end.line;

    if (!inline) {
      return <code className={className} {...props} />;
    }

    return (
      <code
        className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}
        {...props}
      />
    );
  },
};

// Create a hardened version of ReactMarkdown
const HardenedMarkdown = hardenReactMarkdown(ReactMarkdown);

export type ResponseProps = HTMLAttributes<HTMLDivElement> & {
  options?: Options;
  children: Options["children"];
  allowedImagePrefixes?: ComponentProps<
    ReturnType<typeof hardenReactMarkdown>
  >["allowedImagePrefixes"];
  allowedLinkPrefixes?: ComponentProps<
    ReturnType<typeof hardenReactMarkdown>
  >["allowedLinkPrefixes"];
  defaultOrigin?: ComponentProps<ReturnType<typeof hardenReactMarkdown>>["defaultOrigin"];
  parseIncompleteMarkdown?: boolean;
};

export const Response = memo(
  ({
    className,
    options,
    children,
    allowedImagePrefixes,
    allowedLinkPrefixes,
    defaultOrigin,
    parseIncompleteMarkdown: shouldParseIncompleteMarkdown = true,
    ...props
  }: ResponseProps) => {
    // Parse the children to remove incomplete markdown tokens if enabled
    const parsedChildren =
      typeof children === "string" && shouldParseIncompleteMarkdown
        ? parseIncompleteMarkdown(children)
        : children;

    return (
      <div
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        {...props}
      >
        <HardenedMarkdown
          components={components}
          remarkPlugins={[remarkGfm]}
          allowedImagePrefixes={allowedImagePrefixes ?? ["*"]}
          allowedLinkPrefixes={allowedLinkPrefixes ?? ["*"]}
          defaultOrigin={defaultOrigin}
          {...options}
        >
          {parsedChildren}
        </HardenedMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
