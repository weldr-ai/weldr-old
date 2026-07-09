import { filesize } from "filesize";
import { XIcon } from "lucide-react";

import type { Attachment } from "@weldr/shared/types";
import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { shortenFileName } from "@/lib/utils";

export const AttachmentPreview = ({
  attachment,
  isUploading = false,
  uploadProgress,
  onDelete,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  uploadProgress?: number;
  onDelete?: () => void;
}) => {
  const { name, size, url, contentType } = attachment;

  const formattedSize = filesize(size);
  const showProgress = isUploading && uploadProgress !== undefined;

  return (
    <div className="group relative flex w-[180px] shrink-0 items-center justify-center gap-2 rounded-lg border bg-background p-1.5">
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background",
          !isUploading && "opacity-0 group-hover:opacity-100",
          isUploading && "hidden",
        )}
        onClick={onDelete}
      >
        <XIcon className="size-2.5" />
      </Button>

      {/* Completed image preview */}
      {contentType?.startsWith("image") && url && !isUploading && (
        <img
          key={url}
          src={url}
          alt={name ?? "An image attachment"}
          className="size-12 rounded-sm border object-cover"
        />
      )}

      {/* Upload progress indicator */}
      {isUploading && (
        <div className="relative flex size-12 items-center justify-center rounded-sm border bg-muted">
          {/* Circular progress */}
          <svg className="size-10" viewBox="0 0 36 36">
            {/* Background circle */}
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground/20"
            />
            {/* Progress circle */}
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-primary"
              strokeDasharray={`${(uploadProgress ?? 0) * 0.88} 88`}
              transform="rotate(-90 18 18)"
            />
          </svg>
          {/* Percentage text */}
          <span className="absolute text-[10px] font-medium text-foreground">
            {showProgress ? `${Math.round(uploadProgress)}%` : "0%"}
          </span>
        </div>
      )}

      <div className="grid h-full flex-1 gap-1 text-xs leading-none text-muted-foreground">
        <span className="overflow-hidden font-medium text-ellipsis whitespace-nowrap">
          {shortenFileName(name)}
        </span>
        <span className="line-clamp-1 font-normal">
          {isUploading ? "Uploading..." : formattedSize}
        </span>
      </div>
    </div>
  );
};
