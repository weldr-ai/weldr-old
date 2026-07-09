import { useQuery } from "@tanstack/react-query";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import {
  ChevronRightIcon,
  DatabaseIcon,
  DiamondIcon,
  FingerprintIcon,
  HashIcon,
  KeyIcon,
  Link2Icon,
  Table2Icon,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Badge } from "@weldr/ui/components/badge";
import { Card } from "@weldr/ui/components/card";
import { ScrollArea } from "@weldr/ui/components/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";
import { cn } from "@weldr/ui/lib/utils";

import { orpc } from "@/lib/orpc";
import type { CanvasNodeProps } from "@/types";
import { Status } from "../components/status";

export const DbModelNode = memo(
  ({ data: _data, selected, positionAbsoluteX, positionAbsoluteY }: CanvasNodeProps) => {
    const { data: declaration } = useQuery(
      orpc.declarations.get.queryOptions({
        input: {
          id: _data.id,
        },
        initialData: _data,
      }),
    );

    const specs = declaration.metadata?.specs;

    const { fitBounds } = useReactFlow();

    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    // Handle click outside to collapse
    useEffect(() => {
      const handleClickOutside = (event: Event) => {
        if (isExpanded && cardRef.current && !cardRef.current.contains(event.target as Node)) {
          setIsExpanded(false);
          // Call onCollapse callback if it exists
          if (
            "onCollapse" in _data &&
            typeof (_data as unknown as Record<string, unknown>).onCollapse === "function"
          ) {
            ((_data as unknown as Record<string, unknown>).onCollapse as () => void)();
          }
        }
      };

      const handleDocumentClick = (event: MouseEvent) => {
        if (isExpanded && cardRef.current && !cardRef.current.contains(event.target as Node)) {
          setIsExpanded(false);
          // Call onCollapse callback if it exists
          if (
            "onCollapse" in _data &&
            typeof (_data as unknown as Record<string, unknown>).onCollapse === "function"
          ) {
            ((_data as unknown as Record<string, unknown>).onCollapse as () => void)();
          }
        }
      };

      if (isExpanded) {
        // Find the React Flow container and listen to it
        const reactFlowContainer = document.querySelector(".react-flow");
        if (reactFlowContainer) {
          reactFlowContainer.addEventListener("click", handleClickOutside);
        }
        // Also listen to document as fallback
        document.addEventListener("click", handleDocumentClick);
      }

      return () => {
        const reactFlowContainer = document.querySelector(".react-flow");
        if (reactFlowContainer) {
          reactFlowContainer.removeEventListener("click", handleClickOutside);
        }
        document.removeEventListener("click", handleDocumentClick);
      };
    }, [isExpanded, _data]);

    if (!specs || specs.type !== "db-model") {
      return null;
    }

    const maxColumnsInCollapsed = 5;
    const visibleColumns = specs.columns.slice(0, maxColumnsInCollapsed);
    const hiddenColumnsCount = Math.max(0, specs.columns.length - maxColumnsInCollapsed);

    const handleCardClick = () => {
      if (!isExpanded && declaration.progress === "completed") {
        setIsExpanded(true);
        // Call onExpand callback if it exists
        if (
          "onExpand" in _data &&
          typeof (_data as unknown as Record<string, unknown>).onExpand === "function"
        ) {
          ((_data as unknown as Record<string, unknown>).onExpand as () => void)();
        }
        fitBounds(
          {
            x: positionAbsoluteX,
            y: positionAbsoluteY - 200,
            width: 300,
            height: 800,
          },
          {
            duration: 500,
          },
        );
      }
    };

    return (
      <>
        <Card
          ref={cardRef}
          className={cn(
            "drag-handle origin-center cursor-grab p-0 transition-all duration-300 ease-in-out dark:bg-muted",
            {
              "border-primary": selected,
              "w-[400px]": !isExpanded,
              "-translate-x-[100px] -translate-y-[150px] h-[400px] w-[500px]": isExpanded,
            },
          )}
          onClick={handleCardClick}
        >
          {!isExpanded ? (
            // Collapsed view
            <div className="flex size-full flex-col items-start justify-start gap-1.5 p-3">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  {declaration.progress !== "completed" && (
                    <Status progress={declaration.progress} />
                  )}
                  <Table2Icon className="size-3.5 text-primary" />
                  <span className="text-xs font-semibold">{specs.name}</span>
                </div>
                <Badge variant="secondary">{specs.columns.length} cols</Badge>
              </div>

              {/* Column preview - compact list */}
              <div className="w-full space-y-0.5">
                {visibleColumns.map((column, index) => (
                  <div
                    key={`${column.name}-${index}`}
                    className="flex items-center gap-1.5 py-0.5 text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      {column.isPrimaryKey ? (
                        <KeyIcon className="size-2.5 shrink-0 text-warning" />
                      ) : column.unique ? (
                        <FingerprintIcon className="size-2.5 shrink-0 text-primary" />
                      ) : (
                        <div className="size-2.5 shrink-0" />
                      )}
                      <span className="truncate font-mono text-xs">{column.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{column.type}</span>
                      {!column.required ? (
                        <DiamondIcon className="size-2 text-muted-foreground" />
                      ) : (
                        <DiamondIcon className="size-2 fill-current text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
                {hiddenColumnsCount > 0 && (
                  <div className="mt-0.5 flex items-center justify-center text-xs text-muted-foreground">
                    <ChevronRightIcon className="mr-1 size-2.5" />
                    {hiddenColumnsCount} more
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Expanded view
            <div className="nowheel flex h-full w-full cursor-default flex-col">
              {/* Header */}
              <div className="flex flex-col items-start justify-start border-b p-4">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table2Icon className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{specs.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="secondary">{specs.columns.length} cols</Badge>
                    {specs.relationships && specs.relationships.length > 0 && (
                      <Badge variant="outline">{specs.relationships.length} rels</Badge>
                    )}
                    {specs.indexes && specs.indexes.length > 0 && (
                      <Badge variant="outline">{specs.indexes.length} idx</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="space-y-4 p-4">
                  {/* Columns */}
                  <div>
                    <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <DatabaseIcon className="size-3.5" />
                      Columns
                    </h4>
                    <div>
                      {specs.columns.map((column, index) => (
                        <div
                          key={`${column.name}-${index}`}
                          className="flex items-center justify-between rounded py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              {column.isPrimaryKey ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <KeyIcon className="size-3 text-warning" />
                                  </TooltipTrigger>
                                  <TooltipContent className="border bg-muted text-xs">
                                    Primary Key
                                  </TooltipContent>
                                </Tooltip>
                              ) : column.unique ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <FingerprintIcon className="size-3 text-primary" />
                                  </TooltipTrigger>
                                  <TooltipContent className="border bg-muted text-xs">
                                    Unique
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <div className="w-3 flex-shrink-0" />
                              )}
                              <span className="font-mono font-medium">{column.name}</span>
                            </div>
                            <span className="text-muted-foreground">{column.type}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {!column.required ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <DiamondIcon className="size-2.5 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="border bg-muted text-xs">
                                  Nullable
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <DiamondIcon className="size-2.5 fill-current text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="border bg-muted text-xs">
                                  Non-Nullable
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {column.autoIncrement && <Badge variant="outline">auto</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Relationships */}
                  {specs.relationships && specs.relationships.length > 0 && (
                    <div>
                      <h4 className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Link2Icon className="size-3.5" />
                        Relationships
                      </h4>
                      <div>
                        {specs.relationships.map((relationship) => (
                          <div
                            key={`${relationship.referencedModel}-${relationship.referencedColumn}`}
                            className="flex items-center justify-between rounded py-1.5 text-xs"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <Link2Icon className="size-3 text-success" />
                              <span className="font-mono">{relationship.referencedModel}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline">{relationship.type}</Badge>
                              {relationship.onDelete && (
                                <Badge variant="secondary">{relationship.onDelete}</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Indexes */}
                  {specs.indexes && specs.indexes.length > 0 && (
                    <div>
                      <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <HashIcon className="size-3.5" />
                        Indexes
                      </h4>
                      <div>
                        {specs.indexes.map((index) => (
                          <div
                            key={index.name}
                            className="flex items-center justify-between rounded py-1.5 text-xs"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <HashIcon className="size-3 text-purple-500" />
                              <span className="font-mono font-medium">{index.name}</span>
                              <span className="text-muted-foreground">
                                ({index.columns.join(", ")})
                              </span>
                            </div>
                            {index.unique && <Badge variant="secondary">unique</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </Card>

        <Handle
          className={cn("opacity-0")}
          type="target"
          position={Position.Left}
          isConnectable={false}
        />
        <Handle
          className={cn("opacity-0")}
          type="source"
          position={Position.Right}
          isConnectable={false}
        />
      </>
    );
  },
);

DbModelNode.displayName = "DbModelNode";
