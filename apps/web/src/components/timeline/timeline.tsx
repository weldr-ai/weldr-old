import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExpandIcon, ExternalLinkIcon, GitBranchIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button, buttonVariants } from "@weldr/ui/components/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@weldr/ui/components/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";
import { cn } from "@weldr/ui/lib/utils";

import { getPreviewUrl } from "@/lib/preview-url";
import { parseConventionalCommit } from "@/lib/utils";
import { CommitTypeBadge } from "../commit-type-badge";
import { CreateBranchDialog } from "./create-branch-dialog";

type TimelineContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: RouterOutputs["branches"]["getByIdOrMain"];
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

const useTimelineContext = () => {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimelineContext must be used within a TimelineProvider");
  }
  return context;
};

export function TimelineTrigger() {
  const { open, onOpenChange, branch } = useTimelineContext();

  // Determine if this is the main branch based on name
  const isMain = branch.name === "main";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn("h-5 max-w-[60px] px-2 text-xs", {
              "bg-success/30 text-success hover:bg-success/40": isMain,
              "bg-purple-500/30 text-purple-500 hover:bg-purple-500/40": !isMain,
            })}
            onClick={() => onOpenChange(!open)}
          />
        }
      >
        <span className="truncate">{branch.name}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs border bg-muted text-xs">
        {branch.name}
      </TooltipContent>
    </Tooltip>
  );
}

export function Timeline({
  open,
  onOpenChange,
  branch,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  branch: RouterOutputs["branches"]["getByIdOrMain"];
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: true,
    onChange: onOpenChange,
  });

  return (
    <TimelineContext.Provider value={{ open: isOpen, onOpenChange: setIsOpen, branch }}>
      {children}
    </TimelineContext.Provider>
  );
}

type Snapshot = RouterOutputs["branches"]["getByIdOrMain"]["snapshotHistory"][number];

export function TimelineContent({ className }: { className?: string }) {
  const { open, branch } = useTimelineContext();
  const navigate = useNavigate();
  const [highlightedSnapshotId, setHighlightedSnapshotId] = useState<string | null>(null);
  const snapshotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSnapshot = useCallback((snapshotId: string) => {
    const element = snapshotRefs.current[snapshotId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedSnapshotId(snapshotId);

      // Remove highlight after 2 seconds
      setTimeout(() => {
        setHighlightedSnapshotId(null);
      }, 2000);
    }
  }, []);

  // Scroll to current snapshot when timeline opens
  useEffect(() => {
    if (open && branch.snapshot?.id) {
      scrollToSnapshot(branch.snapshot.id);
    }
  }, [open, branch.snapshot?.id, scrollToSnapshot]);

  if (!open) {
    return null;
  }

  const snapshots = branch.snapshotHistory || [];
  const currentSnapshotId = branch.snapshot?.id;
  const isMain = branch.name === "main";

  if (snapshots.length === 0) {
    return (
      <div className="border-b p-4 text-center text-xs text-muted-foreground">
        No snapshots found
      </div>
    );
  }

  return (
    <div className={cn("rounded-t-lg transition-all duration-300 ease-in-out", className)}>
      <div className="scrollbar-thumb-rounded-full scrollbar-thin max-h-[150px] overflow-y-auto scrollbar-thumb-muted-foreground scrollbar-track-transparent">
        <div className="flex flex-col p-3">
          {snapshots.map((snapshot, index) => {
            const parsed = parseConventionalCommit(snapshot.title || "");
            const isLast = index === snapshots.length - 1;
            const isCurrentSnapshot = snapshot.id === currentSnapshotId;
            const isTemporarilyHighlighted = highlightedSnapshotId === snapshot.id;

            return (
              <div key={snapshot.id} className="relative">
                <div
                  ref={(el) => {
                    snapshotRefs.current[snapshot.id] = el;
                  }}
                  className={cn(
                    "grid cursor-default grid-cols-[1fr_1.5rem] items-center gap-2 rounded-md transition-colors duration-300",
                    {
                      "bg-orange-500/10": isTemporarilyHighlighted && !isCurrentSnapshot,
                    },
                  )}
                >
                  <HoverCard>
                    <HoverCardTrigger
                      delay={0}
                      closeDelay={0}
                      className={cn(
                        "grid cursor-pointer grid-cols-[auto_3rem_1fr] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent",
                        {
                          "bg-primary/30 hover:bg-primary/40": isCurrentSnapshot,
                        },
                      )}
                      onClick={() => {
                        if (isMain) {
                          navigate({
                            to: "/projects/$projectId",
                            params: { projectId: snapshot.projectId },
                            search: { snapshotId: snapshot.id },
                          });
                        } else {
                          navigate({
                            to: "/projects/$projectId/branches/$branchId",
                            params: { projectId: snapshot.projectId, branchId: branch.id },
                            search: { snapshotId: snapshot.id },
                          });
                        }
                      }}
                    >
                      <div className="relative flex h-full items-center justify-center">
                        <div className="relative z-10 size-2 shrink-0 rounded-full bg-primary" />
                        {!isLast && (
                          <div
                            className="absolute top-[calc(50%+4px)] bottom-0 left-1/2 z-10 w-px -translate-x-1/2 bg-border"
                            style={{ height: "calc(100% + 0.5rem)" }}
                          />
                        )}
                      </div>

                      <div className="flex items-center">
                        {parsed.type ? (
                          <CommitTypeBadge type={parsed.type} />
                        ) : (
                          <CommitTypeBadge type="pending" />
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {snapshot.title ? (
                          <span className="block truncate text-left text-xs">
                            {parsed.message || snapshot.title}
                          </span>
                        ) : (
                          <span className="block truncate text-left text-xs">
                            Untitled Snapshot
                          </span>
                        )}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="right" align="start" className="w-[350px] p-2">
                      <TimelineItem
                        snapshot={snapshot}
                        projectId={snapshot.projectId}
                        branchId={branch.id}
                        isMain={isMain}
                      />
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  snapshot,
  projectId,
  branchId,
  isMain,
}: {
  snapshot: Snapshot;
  projectId: string;
  branchId: string;
  isMain: boolean;
}) {
  const parsed = parseConventionalCommit(snapshot.title ?? null);
  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false);
  const [branchType, setBranchType] = useState<"variant" | "stream">("variant");

  const previewUrl = getPreviewUrl(snapshot.id, projectId, branchId);

  const handleCreateBranch = (type: "variant" | "stream") => {
    setBranchType(type);
    setCreateBranchDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {parsed.type ? (
            <CommitTypeBadge type={parsed.type} />
          ) : (
            <CommitTypeBadge type="pending" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Link
            to={isMain ? "/projects/$projectId" : "/projects/$projectId/branches/$branchId"}
            params={isMain ? { projectId } : { projectId, branchId }}
            search={{ snapshotId: snapshot.id }}
            className={cn(
              buttonVariants({
                variant: "ghost",
                size: "icon",
              }),
              "size-5 rounded-sm text-muted-foreground hover:text-foreground",
            )}
          >
            <ExpandIcon className="size-3" />
          </Link>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => window.open(previewUrl, "_blank")}
                />
              }
            >
              <ExternalLinkIcon className="size-3" />
              <span className="sr-only">Open Preview</span>
            </TooltipTrigger>
            <TooltipContent className="border bg-muted text-xs">
              <p>Open Preview</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">
          {parsed.message || snapshot.title || "Untitled Snapshot"}
        </span>
        {snapshot.description && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">{snapshot.description}</p>
        )}
      </div>

      <div className="mt-2 flex gap-2 border-t pt-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 gap-1.5 text-[11px] text-purple-500 hover:text-purple-600"
                onClick={() => handleCreateBranch("stream")}
              />
            }
          >
            <GitBranchIcon className="size-3" />
            Create Branch
          </TooltipTrigger>
          <TooltipContent className="border bg-muted text-xs">
            Create a new branch from this snapshot
          </TooltipContent>
        </Tooltip>
      </div>

      <CreateBranchDialog
        open={createBranchDialogOpen}
        onOpenChange={setCreateBranchDialogOpen}
        projectId={projectId}
        snapshotId={snapshot.id}
        snapshotNumber={0}
        branchType={branchType}
      />
    </div>
  );
}
