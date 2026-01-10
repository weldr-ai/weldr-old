"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { TextNode } from "lexical";
import { useCallback, useMemo, useState } from "react";
import * as ReactDOM from "react-dom";
import type { z } from "zod";

import { nanoid } from "@weldr/shared/nanoid";
import type { referencePartSchema } from "@weldr/shared/validators/chats";
import { ScrollArea } from "@weldr/ui/components/scroll-area";
import { cn } from "@weldr/ui/lib/utils";

import { ReferenceBadge } from "../../reference-badge";
import { $createReferenceNode } from "./node";

export class ReferenceOption extends MenuOption {
  reference: z.infer<typeof referencePartSchema>;
  // For extra searching.
  keywords: string[];

  constructor({
    reference,
    options,
  }: {
    reference: z.infer<typeof referencePartSchema>;
    options: {
      keywords?: string[];
    };
  }) {
    super(
      reference.type === "endpoint"
        ? `${reference.method.toUpperCase()} ${reference.path}`
        : reference.name,
    );
    this.reference = reference;
    this.keywords = options.keywords ?? [];
  }
}

export function ReferencesPlugin({
  references,
  position = "top",
}: {
  references: z.infer<typeof referencePartSchema>[];
  position?: "bottom" | "top";
}) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  });

  const onQueryChange = useCallback((matchingString: string | null) => {
    setQueryString(matchingString);
  }, []);

  const onSelectOption = useCallback(
    (selectedOption: ReferenceOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const referenceNode = $createReferenceNode(selectedOption.reference);
        if (nodeToReplace) {
          nodeToReplace.replace(referenceNode);
        }
        referenceNode.decorate();
        closeMenu();
      });
    },
    [editor],
  );

  const inputOptions: ReferenceOption[] = useMemo(() => {
    return references.reduce((acc, reference) => {
      switch (reference.type) {
        case "endpoint": {
          acc.push(
            new ReferenceOption({
              reference,
              options: {
                keywords: [reference.path, reference.method, "endpoint", "api"],
              },
            }),
          );
          break;
        }
        case "db-model": {
          acc.push(
            new ReferenceOption({
              reference,
              options: {
                keywords: [reference.name, "db-model", "database", "table"],
              },
            }),
          );
          break;
        }
        case "page": {
          acc.push(
            new ReferenceOption({
              reference,
              options: {
                keywords: [reference.name, "page"],
              },
            }),
          );
          break;
        }
        default:
          break;
      }
      return acc;
    }, [] as ReferenceOption[]);
  }, [references]);

  const options = useMemo(() => {
    if (!queryString) {
      return inputOptions;
    }

    const regex = new RegExp(queryString, "i");

    return inputOptions.filter(
      (option) =>
        regex.test(
          option.reference.type === "endpoint"
            ? `${option.reference.method.toUpperCase()} ${option.reference.path}`
            : option.reference.name,
        ) || option.keywords.some((keyword) => regex.test(keyword)),
    );
  }, [inputOptions, queryString]);

  return (
    <LexicalTypeaheadMenuPlugin<ReferenceOption>
      onQueryChange={onQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef?.current && options.length ? (
          ReactDOM.createPortal(
            <div
              className="absolute z-50"
              style={
                position === "bottom"
                  ? {
                      bottom: "100%",
                      marginBottom: "24px",
                    }
                  : {}
              }
            >
              <ScrollArea className="h-full w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                <div className="max-h-40">
                  {options.map((option, i: number) => (
                    <div
                      id={`menu-item-${i}`}
                      className={cn(
                        "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground",
                        {
                          "bg-accent": selectedIndex === i,
                        },
                      )}
                      tabIndex={-1}
                      role="option"
                      aria-selected={selectedIndex === i}
                      onClick={() => {
                        setHighlightedIndex(i);
                        selectOptionAndCleanUp(option);
                      }}
                      onKeyUp={() => {
                        setHighlightedIndex(i);
                      }}
                      onKeyDown={() => {
                        setHighlightedIndex(i);
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(i);
                      }}
                      key={nanoid()}
                    >
                      <ReferenceBadge
                        reference={option.reference}
                        className="border-none bg-transparent p-0"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>,
            anchorElementRef.current,
          )
        ) : (
          <div className="absolute bottom-full left-3 mb-2 flex min-w-48 rounded-md border bg-muted p-2 text-xs">
            No references found.
          </div>
        )
      }
    />
  );
}
