import { useMutation } from "@tanstack/react-query";
import { upload } from "@tigrisdata/storage/client";
import equal from "fast-deep-equal";
import { $getRoot, type EditorState, type LexicalEditor, type ParagraphNode } from "lexical";
import { MicIcon, PlusIcon, SendIcon } from "lucide-react";
import React, {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { z } from "zod";

import type { Session } from "@weldr/auth";
import { nanoid } from "@weldr/shared/nanoid";
import type { Attachment, TStatus, UserMessage } from "@weldr/shared/types";
import type { referencePartSchema } from "@weldr/shared/validators/chats";
import { Button } from "@weldr/ui/components/button";
import { WeldrLogo } from "@weldr/ui/components/logos/weldr";
import { Textarea } from "@weldr/ui/components/textarea";
import { cn } from "@weldr/ui/lib/utils";

import { ChatEditor } from "@/components/chat/editor";
import type { ReferenceNode } from "@/components/chat/editor/plugins/reference/node";
import { useUIStore } from "@/lib/context/ui-store";
import { orpc } from "@/lib/orpc";
import { AttachmentPreview } from "./attachment-preview";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8080";

type BaseMultimodalInputProps = {
  type: "textarea" | "editor";
  chatId: string;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  status: TStatus;
  placeholder?: string;
  placeholders?: string[];
  references?: z.infer<typeof referencePartSchema>[];
  formClassName?: string;
  attachmentsClassName?: string;
  textareaClassName?: string;
  onFocus?: () => void;
  isVisible?: boolean;
  session: Session | null;
};

type EditorMultimodalInputProps = BaseMultimodalInputProps & {
  type: "editor";
  message: UserMessage["content"];
  setMessage: Dispatch<SetStateAction<UserMessage["content"]>>;
};

type TextareaMultimodalInputProps = BaseMultimodalInputProps & {
  type: "textarea";
  message: string;
  setMessage: (message: string) => void;
};

type MultimodalInputProps = EditorMultimodalInputProps | TextareaMultimodalInputProps;

function PureMultimodalInput({
  type,
  chatId,
  attachments,
  setAttachments,
  status,
  handleSubmit,
  message,
  setMessage,
  placeholder,
  placeholders,
  references,
  formClassName,
  attachmentsClassName,
  textareaClassName,
  onFocus,
  session,
}: MultimodalInputProps) {
  const { setAuthDialogOpen } = useUIStore();

  const [currentPlaceholder, setCurrentPlaceholder] = useState(placeholder ?? "Send a message...");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<LexicalEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const deleteAttachment = useMutation(orpc.attachments.delete.mutationOptions());

  const submitForm = useCallback(() => {
    handleSubmit();

    const editor = editorRef.current;

    if (editor !== null) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
      });
    }

    if (type === "editor") {
      setMessage([]);
    }

    if (type === "textarea") {
      setMessage("");
    }

    setAttachments([]);
  }, [handleSubmit, setAttachments, setMessage, type]);

  const uploadFile = async (file: File) => {
    try {
      const attachmentId = nanoid();
      const extension = file.name.split(".").pop();
      const key = `attachments/${chatId}/${attachmentId}.${extension}`;

      // Initialize progress
      setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

      const result = await upload(key, file, {
        url: `${SERVER_URL}/attachments/upload`,
        access: "private",
        multipart: true,
        partSize: 5 * 1024 * 1024, // 5 MiB parts
        onUploadProgress: ({ percentage }) => {
          setUploadProgress((prev) => ({ ...prev, [file.name]: percentage }));
        },
      });

      // Clear progress after upload completes
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });

      return {
        id: attachmentId,
        name: file.name,
        key,
        contentType: file.type,
        size: file.size,
        url: result.data?.url,
      };
    } catch (error) {
      // Clear progress on error
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });

      toast.error("Something went wrong!", {
        description:
          error instanceof Error ? error.message : "Failed to upload file, please try again!",
      });
      return undefined;
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        );

        setAttachments((currentAttachments: Attachment[]) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length === 0) return;

      // Prevent default paste behavior for files
      event.preventDefault();

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        );

        setAttachments((currentAttachments: Attachment[]) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading pasted files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  // Add effect to handle paste events
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    if (!placeholders) return;

    let charIndex = 0;
    let isDeleting = false;
    const currentPlaceholder = placeholders[placeholderIndex];

    if (message.length > 0) {
      setCurrentPlaceholder("");
      return;
    }

    const interval = setInterval(() => {
      if (!isDeleting) {
        setCurrentPlaceholder(currentPlaceholder?.slice(0, charIndex) ?? "");
        charIndex++;

        if (charIndex > (currentPlaceholder?.length ?? 0)) {
          isDeleting = true;
          return;
        }
      } else {
        charIndex--;
        setCurrentPlaceholder(currentPlaceholder?.slice(0, charIndex) ?? "");

        if (charIndex === 0) {
          isDeleting = false;
          setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
          return;
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [placeholderIndex, message, placeholders]);

  function onChange(editorState: EditorState) {
    if (type !== "editor") return;

    editorState.read(async () => {
      const root = $getRoot();
      const children = (root.getChildren()[0] as ParagraphNode)?.getChildren();

      let currentText = "";
      const messageParts: UserMessage["content"] = [];

      children?.forEach((child) => {
        if (child.__type === "text") {
          currentText += child.getTextContent();
        }
        if (child.__type === "reference") {
          const referenceNode = child as ReferenceNode;
          const ref = referenceNode.__reference;
          if (ref.type === "db-model") {
            currentText += `<Reference id='${ref.id}' type='db-model' name='${ref.name}' />`;
          } else if (ref.type === "page") {
            currentText += `<Reference id='${ref.id}' type='page' name='${ref.name}' />`;
          } else if (ref.type === "endpoint") {
            currentText += `<Reference id='${ref.id}' type='endpoint' method='${ref.method}' path='${ref.path}' />`;
          }
        }
      });

      if (currentText) {
        messageParts.push({
          type: "text",
          text: currentText,
        });
      }

      setMessage(messageParts);
    });
  }

  return (
    <form
      className={cn("relative flex w-full flex-col", formClassName, {
        "rounded-lg border": type === "textarea",
      })}
    >
      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          className={cn(
            "scrollbar-thumb-rounded-full scrollbar-thin flex flex-row items-center gap-1 overflow-x-auto border-b p-1.5 scrollbar-thumb-muted-foreground scrollbar-track-transparent",
            attachmentsClassName,
          )}
        >
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onDelete={() => {
                if (!attachment.key) return;
                deleteAttachment.mutate({ filename: attachment.key });
                setAttachments((currentAttachments) =>
                  currentAttachments.filter((a) => a.key !== attachment.key),
                );
              }}
            />
          ))}

          {uploadQueue.map((filename) => (
            <AttachmentPreview
              key={filename}
              attachment={{
                id: "",
                key: "",
                size: 0,
                url: "",
                name: filename,
                contentType: "",
              }}
              isUploading={true}
              uploadProgress={uploadProgress[filename] ?? 0}
            />
          ))}
        </div>
      )}

      {status && (
        <div className="flex items-center gap-2 border-b bg-muted px-2 py-1 text-xs">
          <WeldrLogo className="size-4" />
          <span className="inline-flex w-fit animate-shine bg-[linear-gradient(90deg,var(--color-muted-foreground)_0%,var(--color-muted-foreground)_40%,var(--color-foreground)_50%,var(--color-muted-foreground)_60%,var(--color-muted-foreground)_100%)] bg-size-[200%_100%] bg-clip-text text-transparent">
            {status.charAt(0).toUpperCase() + status.slice(1)}
            ...
          </span>
        </div>
      )}

      {type === "editor" && (
        <ChatEditor
          id="general-chat-input"
          placeholder={currentPlaceholder}
          placeholderClassName="text-sms"
          onChange={onChange}
          className={cn(
            "h-[128px] resize-none overflow-y-auto bg-transparent px-3 transition-colors duration-200 focus-visible:ring-0",
            textareaClassName,
          )}
          editorRef={editorRef}
          onSubmit={submitForm}
          references={references}
          typeaheadPosition={"bottom"}
          disabled={!!status}
          onFocus={onFocus}
        />
      )}

      {type === "textarea" && (
        <Textarea
          ref={textareaRef}
          placeholder={currentPlaceholder}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={cn(
            "max-h-[calc(75dvh)] min-h-[128px] resize-none overflow-y-auto rounded-lg border-none bg-input/30 transition-colors duration-200 focus-visible:ring-0",
            {
              "bg-muted/30 opacity-70": !!status,
            },
            textareaClassName,
          )}
          rows={2}
          autoFocus
          disabled={!!status}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (status) {
                toast.error("Something went wrong!", {
                  description: "Something went wrong, please try again!",
                });
              } else {
                submitForm();
              }
            }
          }}
        />
      )}

      <div className="flex w-full flex-row justify-between gap-1 border-t p-1">
        <div className="flex flex-row">
          <AttachmentsButton fileInputRef={fileInputRef} status={status} session={session} />
          {/* TODO: Add voice input */}
          <Button
            type="button"
            onClick={() => {
              if (!session) {
                setAuthDialogOpen(true);
                return;
              }
            }}
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
          >
            <MicIcon className="size-3.5" />
          </Button>
        </div>
        <SendButton
          message={message}
          submitForm={submitForm}
          uploadQueue={uploadQueue}
          status={status}
          session={session}
        />
      </div>
    </form>
  );
}

export const MultimodalInput = memo(PureMultimodalInput, (prevProps, nextProps) => {
  if (!equal(prevProps.message, nextProps.message)) return false;
  if (prevProps.status !== nextProps.status) return false;
  if (!equal(prevProps.attachments, nextProps.attachments)) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  return true;
});

function PureAttachmentsButton({
  fileInputRef,
  status,
  session,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  status: TStatus;
  session: Session | null;
}) {
  const { setAuthDialogOpen } = useUIStore();

  return (
    <Button
      type="button"
      variant="ghost"
      className="size-8 rounded-md"
      onClick={(event) => {
        event.preventDefault();

        if (!session) {
          setAuthDialogOpen(true);
          return;
        }

        fileInputRef.current?.click();
      }}
      disabled={!!status}
    >
      <PlusIcon className="size-3.5" />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

type SendButtonProps = {
  submitForm: () => void;
  message: UserMessage["content"] | string;
  uploadQueue: string[];
  status: TStatus;
  session: Session | null;
};

function PureSendButton({ submitForm, message, uploadQueue, status, session }: SendButtonProps) {
  const { setAuthDialogOpen } = useUIStore();

  const isDisabled =
    (typeof message === "string" && message.length === 0) ||
    (Array.isArray(message) && message.length === 0) ||
    uploadQueue.length > 0 ||
    !!status;

  return (
    <Button
      className="size-8 rounded-md"
      onClick={(event) => {
        event.preventDefault();

        if (!session) {
          setAuthDialogOpen(true);
          return;
        }

        if (status) {
          return;
        }

        submitForm();
      }}
      disabled={isDisabled}
    >
      <SendIcon className="size-3.5" />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length) {
    return false;
  }

  if (!equal(prevProps.message, nextProps.message)) {
    return false;
  }

  if (prevProps.status !== nextProps.status) {
    return false;
  }

  return true;
});
