"use client";

import { useQuery } from "@tanstack/react-query";
import type { Edge } from "@xyflow/react";
import { useParams, useSearchParams } from "next/navigation";

import type { RouterOutputs } from "@weldr/api";

import { orpc } from "@/lib/orpc/client";
import type { CanvasNode } from "@/types";
import { Editor } from "../editor";
import { MainDropdownMenu } from "../main-dropdown-menu";
import { ProjectSettings } from "./settings";

export function ProjectView({
  project: _project,
  branch: _branch,
  environmentVariables: _environmentVariables,
  initialNodes,
  initialEdges,
  integrationTemplates,
}: {
  project: RouterOutputs["projects"]["get"];
  branch: RouterOutputs["branches"]["getByIdOrMain"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  initialNodes: CanvasNode[];
  initialEdges: Edge[];
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
}) {
  const { branchId } = useParams<{ branchId?: string }>();
  const searchParams = useSearchParams();
  const snapshotId = searchParams.get("snapshotId") ?? undefined;

  const { data: project } = useQuery(
    orpc.projects.get.queryOptions({
      input: {
        id: _project.id,
      },
      initialData: _project,
    }),
  );

  const { data: currentBranch } = useQuery(
    orpc.branches.getByIdOrMain.queryOptions({
      input: {
        id: branchId,
        projectId: _project.id,
        snapshotId,
      },
      initialData: _branch,
    }),
  );

  const { data: environmentVariables } = useQuery(
    orpc.environmentVariables.list.queryOptions({
      input: {
        projectId: project.id,
      },
      initialData: _environmentVariables,
    }),
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
