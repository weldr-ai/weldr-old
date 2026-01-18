import { useQueries } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { Edge } from "@xyflow/react";
import { useMemo } from "react";
import { z } from "zod";

import type { NodeType } from "@weldr/shared/types";
import { Spinner } from "@weldr/ui/components/spinner";

import { Editor } from "@/components/editor";
import { MainDropdownMenu } from "@/components/main-dropdown-menu";
import { ProjectSettings } from "@/components/projects/settings";
import { orpc } from "@/lib/orpc";
import type { CanvasNode } from "@/types";
import { getSnapshotDeclarations } from "./-utils/get-snapshot-declarations";

const projectSearchSchema = z.object({
  snapshotId: z.string().optional(),
});

export const Route = createFileRoute("/projects/$projectId/")({
  validateSearch: projectSearchSchema,
  beforeLoad: async ({ context, params, search }) => {
    const { projectId } = params;
    const { snapshotId } = search;

    await Promise.all([
      context.queryClient.prefetchQuery(
        orpc.projects.get.queryOptions({ input: { id: projectId } }),
      ),
      context.queryClient.prefetchQuery(
        orpc.branches.getByIdOrMain.queryOptions({
          input: { projectId, snapshotId },
        }),
      ),
      context.queryClient.prefetchQuery(orpc.integrationTemplates.list.queryOptions()),
      context.queryClient.prefetchQuery(
        orpc.environmentVariables.list.queryOptions({ input: { projectId } }),
      ),
    ]);
  },
  pendingComponent: () => (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  const { snapshotId } = Route.useSearch();
  const { session } = Route.useRouteContext();

  const [
    { data: project },
    { data: branch },
    { data: integrationTemplates = [] },
    { data: environmentVariables = [] },
  ] = useQueries({
    queries: [
      orpc.projects.get.queryOptions({ input: { id: projectId } }),
      orpc.branches.getByIdOrMain.queryOptions({
        input: { projectId, snapshotId },
      }),
      orpc.integrationTemplates.list.queryOptions(),
      orpc.environmentVariables.list.queryOptions({ input: { projectId } }),
    ],
  });

  if (!project || !branch) {
    throw notFound();
  }

  const { initialNodes, initialEdges } = useMemo(() => {
    const snapshotDeclarations = getSnapshotDeclarations(branch.snapshot);

    const nodes: CanvasNode[] =
      snapshotDeclarations?.reduce<CanvasNode[]>((acc, e) => {
        if (!e.declaration.metadata?.specs) return acc;

        acc.push({
          id: e.declaration.nodeId ?? "",
          type: e.declaration.metadata?.specs?.type as NodeType,
          data: e.declaration,
          position: e.declaration.node?.position ?? {
            x: 0,
            y: 0,
          },
        });

        return acc;
      }, []) ?? [];

    const edges: Edge[] = Array.from(
      snapshotDeclarations
        .flatMap((decl: { edges: { dependencyId?: string; dependentId?: string }[] }) => decl.edges)
        .filter(
          (edge: { dependencyId?: string; dependentId?: string }) =>
            edge.dependencyId !== undefined && edge.dependentId !== undefined,
        )
        .reduce((map: Map<string, Edge>, edge: { dependencyId?: string; dependentId?: string }) => {
          const id = `${edge.dependencyId}-${edge.dependentId}`;
          if (!map.has(id)) {
            map.set(id, {
              id,
              source: edge.dependencyId as string,
              target: edge.dependentId as string,
            });
          }
          return map;
        }, new Map<string, Edge>())
        .values(),
    );

    return { initialNodes: nodes, initialEdges: edges };
  }, [branch.snapshot]);

  return (
    <div className="flex size-full flex-col">
      <div className="flex h-10 items-center justify-between border-b p-1.5">
        <MainDropdownMenu session={session} />
        <span className="text-sm font-medium">{project.title ?? "Untitled Project"}</span>
        <ProjectSettings
          project={project}
          integrationTemplates={integrationTemplates}
          environmentVariables={environmentVariables}
        />
      </div>
      <Editor
        session={session}
        project={project}
        branch={branch}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integrationTemplates={integrationTemplates}
        environmentVariables={environmentVariables}
      />
    </div>
  );
}
