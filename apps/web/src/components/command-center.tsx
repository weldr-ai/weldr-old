import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BoxesIcon, ExternalLinkIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { RouterOutputs } from "@weldr/api";
import type { Session } from "@weldr/auth";
import { Button, buttonVariants } from "@weldr/ui/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@weldr/ui/components/command";
import { Separator } from "@weldr/ui/components/separator";
import { cn } from "@weldr/ui/lib/utils";
import { WeldrLogo } from "@weldr/ui/logos/weldr";

import { useUIStore } from "@/lib/context/ui-store";
import { orpc } from "@/lib/orpc";
import { DeleteAlertDialog } from "./delete-alert-dialog";
import { CreateProjectForm } from "./projects/create-project-form";

export function CommandCenter({ session }: { session: Session | null }) {
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
      className="min-h-[600px] max-w-4xl min-w-[896px]"
    >
      <Command className="p-0">
        <div className="flex size-full">
          {commandCenterView === "projects" ? (
            <ProjectsContent />
          ) : commandCenterView === "create" ? (
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
          ) : null}
        </div>
      </Command>
    </CommandDialog>
  );
}

function ProjectsContent() {
  const { setCommandCenterView, setCommandCenterOpen } = useUIStore();
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<
    RouterOutputs["projects"]["list"][number] | null
  >(null);

  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  const deleteProject = useMutation(
    orpc.projects.delete.mutationOptions({
      onSuccess: () => {
        setDeleteProjectOpen(false);
        queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
        toast.success("Project deleted", {
          description: "Your project has been deleted",
        });
      },
      onError: (error) => {
        toast.error("Failed to delete project", {
          description: error.message,
        });
      },
    }),
  );

  return (
    <div className="flex size-full">
      <div className="flex w-[320px] flex-col p-2">
        <CommandInput wrapperClassName="p-0 pb-2" placeholder="Search projects..." />
        <CommandList className="max-h-[512px] grow">
          <CommandEmpty>No projects found.</CommandEmpty>
          <CommandGroup className="p-0 pb-1">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={project.id}
                className={cn("mb-1 flex items-center gap-3 rounded-none", {
                  "bg-accent": selectedProject?.id === project.id,
                })}
                onSelect={() => {
                  setSelectedProject(project);
                }}
              >
                <div className="flex size-8 items-center justify-center rounded-md border bg-muted/30">
                  <WeldrLogo className="size-6" />
                </div>
                <span className="font-medium">{project.title ?? "Untitled Project"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setCommandCenterView("create");
          }}
        >
          <PlusIcon className="size-4" />
          Create New Project
        </Button>
      </div>
      <Separator orientation="vertical" className="bg-border/40" />
      <div className="flex-1 p-2">
        {selectedProject ? (
          <div className="flex h-full flex-col gap-2">
            <Link
              to="/projects/$projectId"
              params={{ projectId: selectedProject.id }}
              onClick={() => {
                setCommandCenterOpen(false);
              }}
              className="block overflow-hidden rounded-lg border"
            >
              <div className="flex aspect-video h-[250px] w-full items-center justify-center rounded-lg bg-muted/30 transition-transform duration-200 hover:scale-[1.1]">
                <WeldrLogo className="size-24" />
              </div>
            </Link>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-semibold">
                    {selectedProject.title ?? "Untitled Project"}
                  </h2>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: selectedProject.id }}
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
              <p className="text-sm text-muted-foreground">
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
    </div>
  );
}
