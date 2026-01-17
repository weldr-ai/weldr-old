import { TRPCError } from "@trpc/server";
import type { Edge } from "@xyflow/react";
import { notFound, redirect } from "next/navigation";

import type { NodeType } from "@weldr/shared/types";

import { ProjectView } from "@/components/projects/project-view";
import { api } from "@/lib/trpc/server";
import type { CanvasNode } from "@/types";
import { getSnapshotDeclarations } from "../../_utils/get-snapshot-declarations";

export default async function BranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; branchId: string }>;
  searchParams: Promise<{ snapshotId?: string }>;
}) {
  try {
    const { projectId, branchId } = await params;
    const { snapshotId } = await searchParams;
    const project = await api.projects.byId({ id: projectId });
    const branch = await api.branches.byIdOrMain({
      id: branchId,
      projectId,
      snapshotId,
    });
    const integrationTemplates = await api.integrationTemplates.list();

    const snapshotDeclarations = getSnapshotDeclarations(branch.snapshot);

    const initialNodes: CanvasNode[] =
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

    const initialEdges: Edge[] = Array.from(
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

    return (
      <ProjectView
        project={project}
        branch={branch}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integrationTemplates={integrationTemplates}
      />
    );
  } catch (error) {
    console.error(error);
    if (error instanceof TRPCError) {
      switch (error.code) {
        case "NOT_FOUND":
          notFound();
        case "UNAUTHORIZED":
        case "FORBIDDEN":
          redirect("/auth/sign-in");
        default:
          return <div>Error</div>;
      }
    }
    return <div>Error</div>;
  }
}
