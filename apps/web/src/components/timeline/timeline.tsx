import { useControllableState } from "@radix-ui/react-use-controllable-state";
import {
  ExpandIcon,
  ExternalLinkIcon,
  GitMergeIcon,
  Undo2Icon,
  WorkflowIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button, buttonVariants } from "@weldr/ui/components/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@weldr/ui/components/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@weldr/ui/components/tooltip";
import { cn } from "@weldr/ui/lib/utils";

import { getPreviewUrl } from "@/lib/preview-url";
import { parseConventionalCommit } from "@/lib/utils";
import { CommitTypeBadge } from "../commit-type-badge";
import { CreateBranchDialog } from "./create-branch-dialog";
import { BranchAncestryBreadcrumb } from "./navigation/branch-ancestry-breadcrumb";
import { ForkIndicator } from "./navigation/fork-indicator";
import { VariantSiblingsNav } from "./navigation/variant-siblings-nav";
import { RevertVersionDialog } from "./revert-version-dialog";

type TimelineContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: RouterOutputs["branches"]["byIdOrMain"];
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

const useTimelineContext = () => {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error(
      "useTimelineContext must be used within a TimelineProvider",
    );
  }
  return context;
};

export function TimelineTrigger() {
  const { open, onOpenChange, branch } = useTimelineContext();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={cn("h-5 max-w-[60px] px-2 text-xs", {
              "bg-success/30 text-success hover:bg-success/40":
                branch.isMain && branch.type === "stream",
              "bg-purple-500/30 text-purple-500 hover:bg-purple-500/40":
                !branch.isMain && branch.type === "stream",
              "bg-orange-500/30 text-orange-500 hover:bg-orange-500/40":
                !branch.isMain && branch.type === "variant",
            })}
            onClick={() => onOpenChange(!open)}
          >
            <span className="truncate">{branch.name}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-xs border bg-muted text-xs"
        >
          {branch.name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  branch: RouterOutputs["branches"]["byIdOrMain"];
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: true,
    onChange: onOpenChange,
  });

  return (
    <TimelineContext.Provider
      value={{ open: isOpen, onOpenChange: setIsOpen, branch }}
    >
      {children}
    </TimelineContext.Provider>
  );
}

export function TimelineContent({ className }: { className?: string }) {
  const { open, branch } = useTimelineContext();
  const router = useRouter();
  const [highlightedVersionId, setHighlightedVersionId] = useState<
    string | null
  >(null);
  const versionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToVersion = (versionId: string) => {
    const element = versionRefs.current[versionId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedVersionId(versionId);

      // Remove highlight after 2 seconds
      setTimeout(() => {
        setHighlightedVersionId(null);
      }, 2000);
    }
  };

  if (!open) {
    return null;
  }

  const versionToBranchesMap = branch.versionToBranchesMap || {};
  const versions = branch.versions || [];
  const ancestryChain = branch.ancestryChain || [];
  const siblingVariants = branch.siblingVariants || [];
  const lastVersion = versions[versions.length - 1];

  // Determine the current version (selectedVersion or headVersion)
  const currentVersionId = branch.selectedVersion?.id ?? branch.headVersion.id;

  if (versions.length === 0) {
    return (
      <div className="border-b p-4 text-center text-muted-foreground text-xs">
        No versions found
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-t-lg transition-all duration-300 ease-in-out",
        className,
      )}
    >
      <BranchAncestryBreadcrumb
        ancestryChain={ancestryChain}
        currentBranch={{ name: branch.name, isMain: branch.isMain }}
      />

      {branch.type === "variant" && siblingVariants.length > 0 && (
        <VariantSiblingsNav siblings={siblingVariants} />
      )}

      <div className="scrollbar-thin scrollbar-thumb-rounded-full scrollbar-thumb-muted-foreground scrollbar-track-transparent max-h-[150px] overflow-y-auto">
        <div className="flex flex-col p-3">
          {lastVersion?.status === "completed" && (
            <div className="relative">
              <div className="grid cursor-default grid-cols-[1fr_1.5rem] items-center gap-2 rounded-md transition-colors duration-300">
                <div className="grid grid-cols-[auto_2.5rem_3rem_1fr] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                  <div className="relative flex h-full items-center justify-center">
                    <div className="relative z-10 size-2 shrink-0 rounded-full bg-muted-foreground" />
                    <div
                      className="-translate-x-1/2 absolute top-[calc(50%+4px)] bottom-0 left-1/2 z-10 w-px border-dashed bg-border"
                      style={{ height: "calc(100% + 0.5rem)" }}
                    />
                  </div>

                  <span className="text-left text-muted-foreground text-xs">
                    #
                    {versions[0]?.sequenceNumber
                      ? versions[0].sequenceNumber + 1
                      : 1}
                  </span>

                  <div className="flex items-center">
                    <CommitTypeBadge type="new" />
                  </div>

                  <span className="text-left text-muted-foreground text-xs">
                    New version
                  </span>
                </div>
              </div>
            </div>
          )}
          {versions.map((version, index) => {
            const forkedBranches = versionToBranchesMap[version.id] || [];
            const parsed = parseConventionalCommit(version.message || "");
            const isLast = index === versions.length - 1;
            const isCurrentVersion = version.id === currentVersionId;
            const isTemporarilyHighlighted =
              highlightedVersionId === version.id;

            return (
              <div key={version.id} className="relative">
                <div
                  ref={(el) => {
                    versionRefs.current[version.id] = el;
                  }}
                  className={cn(
                    "grid cursor-default grid-cols-[1fr_1.5rem] items-center gap-2 rounded-md transition-colors duration-300",
                    {
                      "bg-orange-500/10":
                        isTemporarilyHighlighted && !isCurrentVersion,
                    },
                  )}
                >
                  <HoverCard openDelay={0} closeDelay={0}>
                    <HoverCardTrigger
                      className={cn(
                        "grid cursor-pointer grid-cols-[auto_2.5rem_3rem_1fr] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent",
                        {
                          "bg-primary/30 hover:bg-primary/40": isCurrentVersion,
                        },
                      )}
                      onClick={() => {
                        const url = branch.isMain
                          ? `/projects/${version.projectId}?versionId=${version.id}`
                          : `/projects/${version.projectId}/branches/${version.branchId}?versionId=${version.id}`;
                        router.push(url);
                      }}
                    >
                      <div className="relative flex h-full items-center justify-center">
                        <div
                          className={cn(
                            "relative z-10 size-2 shrink-0 rounded-full",
                            {
                              "bg-primary": version.kind === "checkpoint",
                              "bg-purple-500": version.kind === "integration",
                              "bg-orange-500": version.kind === "revert",
                            },
                          )}
                        />
                        {!isLast && (
                          <div
                            className="-translate-x-1/2 absolute top-[calc(50%+4px)] bottom-0 left-1/2 z-10 w-px bg-border"
                            style={{ height: "calc(100% + 0.5rem)" }}
                          />
                        )}
                      </div>

                      <span className="text-left text-muted-foreground text-xs">
                        #{version.sequenceNumber}
                      </span>

                      <div className="flex items-center">
                        {parsed.type &&
                        (version.status === "completed" ||
                          version.status === "failed") ? (
                          <CommitTypeBadge type={parsed.type} />
                        ) : (
                          <CommitTypeBadge type="pending" />
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {version.message ? (
                          <span className="block truncate text-left text-xs">
                            {parsed.message || version.message}
                          </span>
                        ) : (
                          <span className="block truncate text-left text-xs">
                            Untitled Version
                          </span>
                        )}
                        {version.kind === "integration" &&
                          version.appliedFromBranch && (
                            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-purple-500">
                              <GitMergeIcon className="size-2.5 shrink-0" />
                              <span className="max-w-[72px] truncate">
                                {version.appliedFromBranch.name}
                              </span>
                            </span>
                          )}
                        {version.kind === "revert" &&
                          version.revertedVersion && (
                            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-orange-500">
                              <Undo2Icon className="size-2.5" />#
                              {version.revertedVersion.sequenceNumber}
                            </span>
                          )}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="right"
                      align="start"
                      className="w-[350px] p-2"
                    >
                      <TimelineItem
                        version={version}
                        onScrollToVersion={scrollToVersion}
                      />
                    </HoverCardContent>
                  </HoverCard>
                  {forkedBranches.length > 0 && (
                    <div className="flex items-center justify-end">
                      <ForkIndicator
                        forkedBranches={forkedBranches}
                        versionNumber={version.sequenceNumber}
                      />
                    </div>
                  )}
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
  version,
  onScrollToVersion,
}: {
  version: RouterOutputs["branches"]["byIdOrMain"]["versions"][number];
  onScrollToVersion: (versionId: string) => void;
}) {
  const parsed = parseConventionalCommit(version.message);
  const [createBranchDialogOpen, setCreateBranchDialogOpen] = useState(false);
  const [branchType, setBranchType] = useState<"variant" | "stream">("variant");

  const isPublished =
    version.status === "completed" && version.publishedAt !== null;
  const isFailed = version.status === "failed";

  const isCompleted = isPublished || isFailed;

  const previewUrl = getPreviewUrl(
    version.id,
    version.projectId,
    version.branchId,
  );

  const handleCreateBranch = (type: "variant" | "stream") => {
    setBranchType(type);
    setCreateBranchDialogOpen(true);
  };

  const getKindBadge = () => {
    if (version.kind === "integration") {
      return (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-500">
          <GitMergeIcon className="size-2.5" />
          Integration
        </span>
      );
    }

    if (version.kind === "revert") {
      return (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-500">
          <Undo2Icon className="size-2.5" />
          Revert
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="font-medium text-muted-foreground text-xs">{`#${version.sequenceNumber}`}</span>
          {parsed.type &&
          (version.status === "completed" || version.status === "failed") ? (
            <CommitTypeBadge type={parsed.type} />
          ) : (
            <CommitTypeBadge type="pending" />
          )}
          {getKindBadge()}
        </div>
        <div className="flex items-center gap-0.5">
          <Link
            href={`/projects/${version.projectId}?versionId=${version.id}`}
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
          {(isPublished || version.status === "failed") && (
            <span
              className={cn("rounded-md px-1.5 py-0.5 text-[10px]", {
                "bg-warning text-warning-foreground":
                  version.status === "planning",
                "bg-teal-500 text-teal-50": version.status === "coding",
                "bg-primary text-primary-foreground":
                  version.status === "finalizing",
                "bg-success text-success-foreground":
                  version.status === "completed",
                "bg-destructive text-destructive-foreground":
                  version.status === "failed",
              })}
            >
              {version.status.charAt(0).toUpperCase() + version.status.slice(1)}
            </span>
          )}
          {isCompleted && (
            <>
              <RevertVersionDialog
                version={version}
                onScrollToVersion={onScrollToVersion}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 rounded-sm text-muted-foreground hover:text-foreground"
                    onClick={() => window.open(previewUrl, "_blank")}
                  >
                    <ExternalLinkIcon className="size-3" />
                    <span className="sr-only">Open Preview</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="border bg-muted text-xs">
                  <p>Open Preview</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {version.kind === "integration" && version.appliedFromBranch && (
        <div className="flex min-w-0 items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-1">
          <GitMergeIcon className="size-3 shrink-0 text-purple-500" />
          <div className="flex min-w-0 items-baseline gap-1 text-[10px] text-muted-foreground">
            <span className="shrink-0">Merged from</span>
            <Link
              className="min-w-0 font-medium text-purple-500 underline-offset-1 hover:underline"
              href={`/projects/${version.projectId}/branches/${version.appliedFromBranch.id}`}
            >
              <span className="block truncate">
                {version.appliedFromBranch.name}
              </span>
            </Link>
          </div>
        </div>
      )}

      {version.kind === "revert" &&
        version.revertedVersion &&
        version.revertedVersionId && (
          <div className="flex min-w-0 items-center gap-1 rounded-md bg-orange-500/10 px-1.5 py-1">
            <Undo2Icon className="size-3 shrink-0 text-orange-500" />
            <div className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden text-[10px] text-muted-foreground">
              <span className="shrink-0">Reverted to</span>
              <Button
                variant="ghost"
                onClick={() => {
                  if (version.revertedVersionId) {
                    onScrollToVersion(version.revertedVersionId);
                  }
                }}
                className="h-auto min-w-0 flex-1 overflow-hidden p-0 text-left font-medium text-[10px] text-orange-500 underline-offset-1 hover:bg-transparent hover:text-orange-500 hover:underline"
              >
                <span className="block truncate">
                  {`#${version.revertedVersion.sequenceNumber} ${version.revertedVersion.message}`}
                </span>
              </Button>
            </div>
          </div>
        )}

      {version.status !== "planning" ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-xs">
            {parsed.message || version.message}
          </span>
          {version.description && (
            <p className="line-clamp-2 text-[11px] text-muted-foreground">
              {version.description}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No available information yet.
        </p>
      )}

      {version.status === "completed" && (
        <div className="mt-2 flex gap-2 border-t pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 gap-1.5 text-[11px] text-orange-500 hover:text-orange-600"
                onClick={() => handleCreateBranch("variant")}
              >
                <GitMergeIcon className="size-3" />
                Create Variant
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border bg-muted text-xs">
              Create a variant branch to explore different implementations
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 gap-1.5 text-[11px] text-purple-500 hover:text-purple-600"
                onClick={() => handleCreateBranch("stream")}
              >
                <WorkflowIcon className="size-3" />
                Create Stream
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border bg-muted text-xs">
              Create a long-lived stream branch for ongoing development
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      <CreateBranchDialog
        open={createBranchDialogOpen}
        onOpenChange={setCreateBranchDialogOpen}
        projectId={version.projectId}
        versionId={version.id}
        versionNumber={version.sequenceNumber}
        branchType={branchType}
      />
    </div>
  );
}
