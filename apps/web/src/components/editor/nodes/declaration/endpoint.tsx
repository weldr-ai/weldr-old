import { useQuery } from "@tanstack/react-query";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import type { OpenAPIV3 } from "openapi-types";
import { memo, useEffect, useRef, useState } from "react";

import { Badge } from "@weldr/ui/components/badge";
import { Card } from "@weldr/ui/components/card";
import { ScrollArea } from "@weldr/ui/components/scroll-area";
import { cn } from "@weldr/ui/lib/utils";

import { OpenApiViewer } from "@/components/openapi-viewer";
import { orpc } from "@/lib/orpc";
import type { CanvasNodeProps } from "@/types";
import { ProtectedBadge } from "../components/protected-badge";
import { Status } from "../components/status";

export const EndpointNode = memo(
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

    useEffect(() => {
      const handleClickOutside = (event: Event) => {
        if (isExpanded && cardRef.current && !cardRef.current.contains(event.target as Node)) {
          setIsExpanded(false);
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
          if (
            "onCollapse" in _data &&
            typeof (_data as unknown as Record<string, unknown>).onCollapse === "function"
          ) {
            ((_data as unknown as Record<string, unknown>).onCollapse as () => void)();
          }
        }
      };

      if (isExpanded) {
        const reactFlowContainer = document.querySelector(".react-flow");
        if (reactFlowContainer) {
          reactFlowContainer.addEventListener("click", handleClickOutside);
        }
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

    if (!specs || specs.type !== "endpoint") {
      return null;
    }

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
            y: positionAbsoluteY - 150,
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
              "max-h-[400px] w-[300px]": !isExpanded,
              "-translate-x-[72px] -translate-y-[108px] h-[400px] w-[500px]": isExpanded,
            },
          )}
          onClick={handleCardClick}
        >
          {!isExpanded ? (
            // Collapsed view
            <div className="flex size-full flex-col items-start justify-center gap-2 p-3">
              <div className="flex w-full items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-1 text-xs">
                  {declaration.progress !== "completed" && (
                    <Status progress={declaration.progress} />
                  )}
                  <Badge
                    className={cn("shrink-0 font-bold uppercase", {
                      "bg-primary/30 text-primary": specs.method === "get",
                      "bg-success/30 text-success": specs.method === "post",
                      "bg-warning/30 text-warning": specs.method === "put",
                      "bg-destructive/30 text-destructive": specs.method === "delete",
                      "p-0 font-semibold text-primary text-xs": !specs.method,
                    })}
                  >
                    {specs.method?.toUpperCase() || "API"}
                  </Badge>
                  <span className="truncate font-mono text-xs">
                    {(specs.path || "/api/endpoint").split(/(\{[^}]+\})/).map((part) => (
                      <span
                        key={part || `path-segment-${Math.random()}`}
                        className={cn(
                          part.startsWith("{") && part.endsWith("}")
                            ? "font-medium text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {part}
                      </span>
                    ))}
                  </span>
                </div>
                <ProtectedBadge protected={specs.protected ?? false} />
              </div>
              {specs.summary && (
                <span className="w-full truncate text-start text-sm">{specs.summary}</span>
              )}
              {specs.description && (
                <span className="w-full text-start text-xs text-muted-foreground">
                  {specs.description}
                </span>
              )}
            </div>
          ) : (
            // Expanded view
            <div className="nowheel flex h-full w-full cursor-default flex-col">
              {/* Header */}
              <div className="flex flex-col items-start justify-start gap-2 border-b p-4">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-xs font-semibold text-primary">REST</span>
                    <span className="text-muted-foreground">Endpoint</span>
                  </div>
                  <ProtectedBadge protected={specs.protected ?? false} />
                </div>
                <h3 className="text-sm">{specs.summary || specs.path || "API Endpoint"}</h3>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1 overflow-hidden p-4">
                <OpenApiViewer
                  spec={
                    specs
                      ? ({
                          openapi: "3.0.0",
                          info: {
                            title: "Sample API",
                            version: "1.0.0",
                          },
                          paths: {
                            [specs.path]: {
                              [specs.method]: specs,
                            },
                          },
                        } as OpenAPIV3.Document)
                      : null
                  }
                />
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
