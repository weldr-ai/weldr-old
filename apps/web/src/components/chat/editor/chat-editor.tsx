import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import type { z } from "zod";

import type { referencePartSchema } from "@weldr/shared/validators/chats";
import { cn } from "@weldr/ui/lib/utils";

import { ReferencesPlugin } from "@/components/chat/editor/plugins/reference";
import { ReferenceNode } from "@/components/chat/editor/plugins/reference/node";

interface ChatEditorProps {
  id: string;
  placeholder?: string;
  placeholderClassName?: string;
  onChange?: (editorState: EditorState) => void;
  className?: string;
  editorRef?: { current: null | LexicalEditor };
  references?: z.infer<typeof referencePartSchema>[];
  typeaheadPosition?: "bottom" | "top";
  onSubmit?: () => void;
  disabled?: boolean;
  onFocus?: () => void;
}

export function ChatEditor({ ...props }: ChatEditorProps) {
  const initialConfig: InitialConfigType = {
    namespace: `editor-${props.id}`,
    onError: (error) => {
      console.error(error);
    },
    nodes: [ReferenceNode],
    editable: true,
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const editorContainer = document.getElementById(`editor-${props.id}`);
      if (
        e.key === "Enter" &&
        props.onSubmit &&
        editorContainer &&
        editorContainer.contains(e.target as Node)
      ) {
        e.preventDefault();
        props.onSubmit();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.onSubmit, props.id]);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div id={`editor-${props.id}`} className="flex size-full">
        <ReferencesPlugin references={props.references ?? []} position={props.typeaheadPosition} />
        <RichTextPlugin
          contentEditable={
            <div className="size-full">
              <ContentEditable
                className={cn(
                  "flex size-full min-h-[120px] cursor-text flex-col overflow-y-auto bg-background px-3 py-2 text-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                  !props.className &&
                    "rounded-lg border focus-visible:ring-1 focus-visible:ring-ring",
                  props.className,
                )}
                disabled={props.disabled}
                onFocus={props.onFocus}
              />
            </div>
          }
          placeholder={
            <div className="pointer-events-none absolute px-3 py-2 text-sm text-muted-foreground">
              {props.placeholder ?? "Start typing..."}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      {props.onChange && <OnChangePlugin onChange={props.onChange} />}
      <HistoryPlugin />
      {props.editorRef && <EditorRefPlugin editorRef={props.editorRef} />}
    </LexicalComposer>
  );
}
