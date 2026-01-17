"use client";

import { useQuery } from "@tanstack/react-query";
import type { Edge } from "@xyflow/react";
import { useParams, useSearchParams } from "next/navigation";

import type { RouterOutputs } from "@weldr/api";

import { useTRPC } from "@/lib/trpc/react";
import type { CanvasNode } from "@/types";
import { Editor } from "../editor";
import { MainDropdownMenu } from "../main-dropdown-menu";
import { ProjectSettings } from "./settings";

export function ProjectView({
  project: _project,
  branch: _branch,
  initialNodes,
  initialEdges,
  integrationTemplates,
}: {
  project: RouterOutputs["projects"]["byId"];
  branch: RouterOutputs["branches"]["byIdOrMain"];
  initialNodes: CanvasNode[];
  initialEdges: Edge[];
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
}) {
  const { branchId } = useParams<{ branchId?: string }>();
  const searchParams = useSearchParams();
  const snapshotId = searchParams.get("snapshotId") ?? undefined;

  const trpc = useTRPC();

  const { data: project } = useQuery(
    trpc.projects.byId.queryOptions(
      {
        id: _project.id,
      },
      {
        initialData: _project,
      },
    ),
  );

  const { data: currentBranch } = useQuery(
    trpc.branches.byIdOrMain.queryOptions(
      {
        id: branchId,
        projectId: _project.id,
        snapshotId,
      },
      {
        initialData: _branch,
      },
    ),
  );

  const { data: environmentVariables } = useQuery(
    trpc.environmentVariables.list.queryOptions(
      {
        projectId: project.id,
      },
      {
        initialData: project.environmentVariables,
      },
    ),
  );

  return (
    <div className="flex size-full flex-col">
      <div className="flex h-10 items-center justify-between border-b p-1.5">
        <MainDropdownMenu />
        <span className="font-medium text-sm">{project.title ?? "Untitled Project"}</span>
        <ProjectSettings
          project={project}
          integrationTemplates={integrationTemplates}
          environmentVariables={environmentVariables}
        />
      </div>
      <Editor
        project={project}
        branch={currentBranch}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        integrationTemplates={integrationTemplates}
        environmentVariables={environmentVariables}
      />
    </div>
  );
}
