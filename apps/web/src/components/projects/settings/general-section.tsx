import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, LoaderIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import type { RouterOutputs } from "@weldr/api";
import { updateProjectSchema } from "@weldr/shared/validators/projects";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@weldr/ui/components/form";
import { Input } from "@weldr/ui/components/input";
import { toast } from "@weldr/ui/hooks/use-toast";

import { DeleteAlertDialog } from "@/components/delete-alert-dialog";
import { getProjectDownloadUrl } from "@/lib/actions/get-project-download-url";
import { useTRPC } from "@/lib/trpc/react";

export function GeneralSection({ project }: { project: RouterOutputs["projects"]["byId"] }) {
  const router = useRouter();
  const [isDownloading, setIsDownloading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const updateProject = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.projects.byId.queryFilter({ id: project.id }));
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
      },
    }),
  );

  const deleteProject = useMutation(
    trpc.projects.delete.mutationOptions({
      onSuccess: () => {
        router.push("/");
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
        });
      },
    }),
  );

  const form = useForm<z.infer<typeof updateProjectSchema>>({
    mode: "onChange",
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      where: {
        id: project.id,
      },
      payload: {
        title: project.title ?? "",
        subdomain: project.subdomain,
      },
    },
  });

  async function onSubmit(data: z.infer<typeof updateProjectSchema>) {
    const result = await updateProject.mutateAsync(data);
    form.reset({
      where: {
        id: result.id,
      },
      payload: {
        title: result.title ?? "",
        subdomain: result.subdomain,
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Update your project name and subdomain, download your project code, or delete your
          project.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex flex-col">
            <h3 className="font-medium">General</h3>
            <p className="text-muted-foreground text-sm">General project settings</p>
          </div>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="payload.title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payload.subdomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subdomain</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input placeholder="Enter subdomain" {...field} />
                        <span className="absolute top-[9px] right-2.5 text-muted-foreground text-xs">
                          .weldr.app
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    updateProject.isPending || !form.formState.isValid || !form.formState.isDirty
                  }
                >
                  {updateProject.isPending && <LoaderIcon className="mr-2 size-3.5 animate-spin" />}
                  Update
                </Button>
              </div>
            </form>
          </Form>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
          <div className="flex flex-col">
            <h3 className="font-medium">Download Project</h3>
            <p className="text-muted-foreground text-sm">Download your project code.</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isDownloading}
            onClick={async () => {
              setIsDownloading(true);
              const url = await getProjectDownloadUrl({
                projectId: project.id,
              });
              window.open(url, "_blank");
              setIsDownloading(false);
            }}
          >
            {isDownloading ? (
              <LoaderIcon className="mr-2 size-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="mr-2 size-3.5" />
            )}
            Download
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
          <div className="flex flex-col">
            <h3 className="font-medium">Delete Project</h3>
            <p className="text-muted-foreground text-sm">
              Permanently delete your project and all associated data.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDeleteDialogOpen(true)}>
            <TrashIcon className="mr-2 size-3.5 text-destructive" />
            Delete Project
          </Button>
          <DeleteAlertDialog
            open={deleteDialogOpen}
            setOpen={setDeleteDialogOpen}
            confirmText={project.title ?? "delete"}
            isPending={deleteProject.isPending}
            onDelete={() => {
              deleteProject.mutateAsync({ id: project.id });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
