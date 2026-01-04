import { TRPCError } from "@trpc/server";
import type { Edge } from "@xyflow/react";
import { notFound, redirect } from "next/navigation";

import type { NodeType } from "@weldr/shared/types";

import { ProjectView } from "@/components/projects/project-view";
import { api } from "@/lib/trpc/server";
import type { CanvasNode } from "@/types";
import { getVersionDeclarations } from "./_utils/get-version-declarations";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  try {
    const { projectId } = await params;
    const { versionId } = await searchParams;
    const project = await api.projects.byId({ id: projectId });
    const branch = await api.branches.byIdOrMain({
      projectId: project.id,
      versionId,
    });
    const integrationTemplates = await api.integrationTemplates.list();

    const versionToUse = branch.selectedVersion ?? branch.headVersion;
    const versionDeclarations = getVersionDeclarations(versionToUse);

    const initialNodes: CanvasNode[] =
      versionDeclarations?.reduce<CanvasNode[]>((acc, e) => {
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
      versionDeclarations
        .flatMap((decl) => decl.edges)
        .filter(
          (edge) =>
            edge.dependencyId !== undefined && edge.dependentId !== undefined,
        )
        .reduce((map, edge) => {
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
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: notFound function already returns
        case "NOT_FOUND":
          notFound();
        case "UNAUTHORIZED":
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: redirect function already returns
        case "FORBIDDEN":
          redirect("/auth/sign-in");
        default:
          return <div>Error</div>;
      }
    }
    return <div>Error</div>;
  }
}
