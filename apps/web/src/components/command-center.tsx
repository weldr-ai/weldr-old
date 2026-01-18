"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BoxesIcon, ExternalLinkIcon, PlusIcon, TrashIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import type { Session } from "@weldr/auth";
import { authClient } from "@weldr/auth/client";
import { Button, buttonVariants } from "@weldr/ui/components/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@weldr/ui/components/command";
import { toast } from "@weldr/ui/hooks/use-toast";
import { LogoIcon } from "@weldr/ui/icons";
import { cn } from "@weldr/ui/lib/utils";

import { type CommandCenterView, useUIStore } from "@/lib/context/ui-store";
import { orpc } from "@/lib/orpc/client";
import { DeleteAlertDialog } from "./delete-alert-dialog";
import { CreateProjectForm } from "./projects/create-project-form";

export function CommandCenter({ projects }: { projects: RouterOutputs["projects"]["list"] }) {
  const { data: session } = authClient.useSession();

  const { commandCenterOpen, commandCenterView, setCommandCenterOpen, setCommandCenterView } =
    useUIStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && session) {
        e.preventDefault();
        setCommandCenterView("projects");
        setCommandCenterOpen(true);
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        e.preventDefault();
        setCommandCenterView("create");
        setCommandCenterOpen(true);
      }
    },
    [setCommandCenterOpen, setCommandCenterView, session],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  return (
    <CommandDialog
      open={commandCenterOpen}
      onOpenChange={setCommandCenterOpen}
      dialogClassName="min-h-[600px] min-w-[896px] max-w-4xl"
      commandClassName="size-full [&_[cmdk-group-heading]]:px-0 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-0"
    >
      <CommandCenterContent view={commandCenterView} projects={projects} session={session} />
    </CommandDialog>
  );
}

function CommandCenterContent({
  view,
  projects,
  session,
}: {
  view: CommandCenterView;
  projects: RouterOutputs["projects"]["list"];
  session: Session | null;
}) {
  return (
    <div className="flex size-full">
      {view === "projects" ? (
        <ProjectsContent projects={projects} />
      ) : view === "create" ? (
        <CreateContent session={session} />
      ) : null}
    </div>
  );
}

function CreateContent({ session }: { session: Session | null }) {
  const { setCommandCenterView } = useUIStore();

  return (
    <div className="relative flex size-full items-center justify-center">
      {session && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3"
          onClick={() => setCommandCenterView("projects")}
        >
          <BoxesIcon className="mr-2 size-4" />
          View Projects
        </Button>
      )}
      <CreateProjectForm session={session} />
    </div>
  );
}

function ProjectsContent({
  projects: initialProjects,
}: {
  projects: RouterOutputs["projects"]["list"];
}) {
  const { setCommandCenterView, setCommandCenterOpen } = useUIStore();
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<
    RouterOutputs["projects"]["list"][number] | null
  >(null);

  const queryClient = useQueryClient();

  const { data: projects } = useQuery(
    orpc.projects.list.queryOptions({ input: {}, initialData: initialProjects }),
  );

  const deleteProject = useMutation(
    orpc.projects.delete.mutationOptions({
      onSuccess: () => {
        setDeleteProjectOpen(false);
        queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
        toast({
          title: "Project deleted",
          description: "Your project has been deleted",
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Failed to delete project",
          description: "Please try again",
        });
      },
    }),
  );

  return (
    <>
      <div className="border-r">
        <CommandInput className="border-0 focus:ring-0" placeholder="Search projects..." />
        <CommandList className="scrollbar-thin scrollbar-thumb-muted-foreground scrollbar-track-muted max-h-[calc(100%-84px)] w-[320px] overflow-y-auto">
          <CommandEmpty>No projects found.</CommandEmpty>
          <CommandGroup className="p-0 **:[[cmdk-group-heading]]:px-0 **:[[cmdk-group-heading]]:py-0">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={project.id}
                className={cn("flex items-center gap-3 rounded-none p-2", {
                  "bg-accent": selectedProject?.id === project.id,
                })}
                onSelect={() => {
                  setSelectedProject(project);
                }}
              >
                <div className="flex size-8 items-center justify-center rounded-md border bg-muted/30">
                  <LogoIcon className="size-6" />
                </div>
                <span className="font-medium">{project.title ?? "Untitled Project"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <Button
            variant="ghost"
            className="absolute bottom-0 w-80 rounded-t-none rounded-br-none rounded-bl-lg border-t bg-background"
            onClick={() => {
              setCommandCenterView("create");
            }}
          >
            <PlusIcon className="mr-2 size-4" />
            Create New Project
          </Button>
        </CommandList>
      </div>
      <div className="flex-1 p-6">
        {selectedProject ? (
          <div className="flex h-full flex-col gap-2">
            <Link
              href={`/projects/${selectedProject.id}`}
              onClick={() => {
                setCommandCenterOpen(false);
              }}
              className="block overflow-hidden rounded-lg border"
            >
              <div className="flex aspect-video h-[250px] w-full items-center justify-center rounded-lg bg-muted/30 transition-transform duration-200 hover:scale-[1.1]">
                <LogoIcon className="size-24" />
              </div>
            </Link>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h2 className="font-semibold text-xl">
                    {selectedProject.title ?? "Untitled Project"}
                  </h2>
                  <Link
                    href={`/projects/${selectedProject.id}`}
                    onClick={() => {
                      setCommandCenterOpen(false);
                    }}
                    className={cn(
                      buttonVariants({
                        variant: "ghost",
                        size: "icon",
                      }),
                      "size-7",
                    )}
                  >
                    <ExternalLinkIcon className="size-3" />
                  </Link>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteProjectOpen(true)}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
                <DeleteAlertDialog
                  open={deleteProjectOpen}
                  setOpen={setDeleteProjectOpen}
                  onDelete={() => {
                    deleteProject.mutate({ id: selectedProject.id });
                  }}
                  confirmText={selectedProject.title ?? "delete"}
                  isPending={deleteProject.isPending}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                {selectedProject.description ?? "No description"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a project to view details
          </div>
        )}
      </div>
    </>
  );
}
