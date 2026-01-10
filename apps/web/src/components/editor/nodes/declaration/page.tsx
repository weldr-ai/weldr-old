import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Handle, Position } from "@xyflow/react";
import {
  CircleIcon,
  ExpandIcon,
  HammerIcon,
  LoaderIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldXIcon,
} from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { memo, useCallback, useState } from "react";

import { Badge } from "@weldr/ui/components/badge";
import { Button } from "@weldr/ui/components/button";
import { Card, CardContent } from "@weldr/ui/components/card";
import { Input } from "@weldr/ui/components/input";
import { Label } from "@weldr/ui/components/label";
import { cn } from "@weldr/ui/lib/utils";

import { SitePreviewDialog } from "@/components/site-preview-dialog";
import { getPreviewUrl as buildPreviewUrl } from "@/lib/preview-url";
import { useTRPC } from "@/lib/trpc/react";
import type { CanvasNodeProps } from "@/types";
import { ProtectedBadge } from "../components/protected-badge";

interface PageNodeHeaderProps {
  name: string;
  protected: boolean;
  children?: React.ReactNode;
}

const PageNodeHeader = memo(({ name, protected: isProtected, children }: PageNodeHeaderProps) => (
  <div className="-top-10 absolute right-0 left-0 z-20 flex h-8 items-center justify-between gap-2 rounded-md border bg-muted px-2 py-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
    <div className="flex items-center gap-2">
      <span className="font-semibold text-primary text-xs">PAGE</span>
      <span className="font-medium text-sm">{name}</span>
    </div>
    <div className="flex items-center gap-1">
      {children}
      <ProtectedBadge protected={isProtected} />
    </div>
  </div>
));

export const PageNode = memo(({ data: _data, selected }: CanvasNodeProps) => {
  if (_data.metadata?.specs?.type !== "page") {
    throw new Error("Page node data is not a page");
  }

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projectId, branchId } = useParams<{
    projectId: string;
    branchId?: string;
  }>();
  const searchParams = useSearchParams();
  const versionId = searchParams.get("versionId") ?? undefined;

  const branch = queryClient.getQueryData(
    trpc.branches.byIdOrMain.queryKey({
      id: branchId,
      projectId,
      versionId,
    }),
  );

  const versionToUse = branch?.selectedVersion ?? branch?.headVersion;

  const { data: declaration } = useQuery(
    trpc.declarations.byId.queryOptions(
      {
        id: _data.id,
      },
      {
        initialData: _data,
      },
    ),
  );

  const specs = declaration.metadata?.specs;

  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [sitePreviewDialogOpen, setSitePreviewDialogOpen] = useState(false);

  // Extract parameters from route (e.g., /users/{id} -> ["id"])
  const getRouteParameters = useCallback(() => {
    if (!specs || specs.type !== "page") {
      return [];
    }

    return (
      specs.parameters?.filter((param) => param.in === "path").map((param) => param.name) ?? []
    );
  }, [specs]);

  // Build preview URL with parameters
  const getPreviewUrl = useCallback(() => {
    if (!specs || specs.type !== "page") {
      return "";
    }

    const baseUrl =
      versionToUse?.id && projectId && branch?.id
        ? buildPreviewUrl(versionToUse.id, projectId, branch.id)
        : "";

    let route = specs?.route.replace(/^\//, "");

    const routeParameters = getRouteParameters();
    const hasParameters = routeParameters.length > 0;

    if (!hasParameters) {
      return `${baseUrl}/${route}`;
    }

    for (const param of routeParameters) {
      if (parameterValues[param]) {
        route = route.replace(`{${param}}`, parameterValues[param]);
      }
    }

    return `${baseUrl}/${route}`;
  }, [versionToUse?.id, projectId, branch?.id, specs, getRouteParameters, parameterValues]);

  const canShowPreview = useCallback(() => {
    const routeParameters = getRouteParameters();
    return !routeParameters.length || routeParameters.every((param) => parameterValues[param]);
  }, [getRouteParameters, parameterValues]);

  const getResolvedRoute = useCallback(() => {
    if (!specs || specs.type !== "page") {
      return "";
    }

    const routeParameters = getRouteParameters();
    const hasParameters = routeParameters.length > 0;

    if (!hasParameters) {
      return specs.route;
    }

    let resolvedRoute = specs.route;

    for (const param of routeParameters) {
      if (parameterValues[param]) {
        resolvedRoute = resolvedRoute.replace(`{${param}}`, parameterValues[param]);
      }
    }

    return resolvedRoute.split(/(\{[^}]+\})/).map((part) => (
      <span
        key={part || `path-segment-${Math.random()}`}
        className={cn(part.startsWith("{") && part.endsWith("}") ? "text-warning" : "")}
      >
        {part}
      </span>
    ));
  }, [specs, getRouteParameters, parameterValues]);

  const getColorizedRoute = useCallback(() => {
    if (!specs || specs.type !== "page") {
      return "";
    }

    return specs.route.split(/(\{[^}]+\})/).map((part) => (
      <span
        key={part || `path-segment-${Math.random()}`}
        className={cn(part.startsWith("{") && part.endsWith("}") ? "text-warning" : "")}
      >
        {part}
      </span>
    ));
  }, [specs]);

  // Determine the current state
  const isVersionCompleted = versionToUse?.status === "completed";
  const isDeclarationCompleted = declaration.progress === "completed";
  const needsParameters = getRouteParameters().length > 0 && (!showPreview || !canShowPreview());
  const isPreviewReady = isDeclarationCompleted && isVersionCompleted && !needsParameters;

  if (!specs || specs.type !== "page") {
    return null;
  }

  return (
    <>
      <Card
        className={cn(
          "nowheel drag-handle group relative h-[300px] w-[400px] origin-center cursor-grab rounded-lg p-0 dark:bg-muted",
          {
            "border-primary": selected,
            "border-none": isPreviewReady,
          },
        )}
      >
        <PageNodeHeader name={specs.name} protected={specs.protected ?? false}>
          {isPreviewReady && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setSitePreviewDialogOpen(true)}
            >
              <ExpandIcon className="size-3" />
            </Button>
          )}
        </PageNodeHeader>

        {isPreviewReady ? (
          <div className="relative h-[300px] w-[400px] overflow-hidden rounded-lg">
            <iframe
              src={getPreviewUrl()}
              className="absolute top-0 left-0 h-[600px] w-[800px] origin-top-left scale-[0.5] rounded-lg border-0"
              title={specs.name}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="lazy"
            />

            <div className="absolute bottom-4 left-4 opacity-0 transition-opacity group-hover:opacity-100">
              <Badge variant="secondary" className="font-mono text-xs">
                {getResolvedRoute()}
              </Badge>
            </div>
          </div>
        ) : (
          <CardContent className="flex size-full flex-col items-center justify-center space-y-6">
            {(!isDeclarationCompleted || !isVersionCompleted) && (
              <>
                {declaration.progress !== "completed" && (
                  <div className="animate-pulse space-y-2">
                    {declaration.progress === "pending" && (
                      <>
                        <CircleIcon className="mx-auto size-8 fill-warning text-warning" />
                        <h3 className="font-semibold text-lg">Pending</h3>
                      </>
                    )}
                    {declaration.progress === "in_progress" && (
                      <>
                        <HammerIcon className="mx-auto size-8 text-primary" />
                        <h3 className="font-semibold text-lg">Building</h3>
                      </>
                    )}
                  </div>
                )}

                {!isVersionCompleted && declaration.progress === "completed" && (
                  <div className="space-y-2">
                    <LoaderIcon className="mx-auto size-8 animate-spin text-primary" />
                    <h3 className="font-semibold text-lg">Loading</h3>
                  </div>
                )}

                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm">
                    <span className="text-muted-foreground">Page:</span> {specs.name}
                  </span>
                  <span className="text-sm">
                    <span className="text-muted-foreground">Route:</span> {getColorizedRoute()}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {specs.protected ? (
                    <ShieldCheckIcon className="size-3 text-success" />
                  ) : (
                    <ShieldXIcon className="size-3 text-destructive" />
                  )}
                  {specs.protected ? "Protected" : "Public"}
                </Badge>
              </>
            )}

            {needsParameters && isVersionCompleted && isDeclarationCompleted && (
              <>
                <div className="space-y-2 text-center">
                  <SettingsIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h3 className="font-semibold text-lg">Parameters Required</h3>
                  <p className="text-muted-foreground text-sm">
                    Enter parameter values to preview this page
                  </p>
                </div>

                <div className="w-full max-w-sm space-y-2">
                  {getRouteParameters().map((param) => (
                    <div key={param} className="space-y-2">
                      <Label>{param}</Label>
                      <Input
                        id={`param-${param}`}
                        placeholder={`Enter ${param}...`}
                        value={parameterValues[param] || ""}
                        onChange={(e) =>
                          setParameterValues((prev) => ({
                            ...prev,
                            [param]: e.target.value,
                          }))
                        }
                        className="h-8 w-full"
                      />
                    </div>
                  ))}
                  <Button
                    onClick={() => setShowPreview(true)}
                    disabled={!canShowPreview}
                    className="w-full"
                    size="sm"
                  >
                    Preview
                  </Button>
                </div>
                <span className="text-sm">
                  <span className="text-muted-foreground">Route:</span> {getColorizedRoute()}
                </span>
              </>
            )}
          </CardContent>
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

      {isPreviewReady && (
        <SitePreviewDialog
          open={sitePreviewDialogOpen}
          onOpenChange={setSitePreviewDialogOpen}
          title={specs.name}
          url={getPreviewUrl()}
          browserHeader={false}
          isProtected={specs.protected ?? false}
        />
      )}
    </>
  );
});
