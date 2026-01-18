"use client";

import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@weldr/api";

import { orpc } from "@/lib/orpc/client";

export function ProjectsList({
  projects: _projects,
}: {
  projects: RouterOutputs["projects"]["list"];
}) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions({ initialData: _projects }));

  return (
    <div className="flex w-full flex-col gap-4">
      <h3 className="text-center font-bold text-lg">Projects</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <div key={project.id} className="flex flex-col gap-2">
            <div className="size-54 rounded-lg bg-muted" />
            <span className="font-medium text-sm">{project.title ?? "Untitled Project"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
