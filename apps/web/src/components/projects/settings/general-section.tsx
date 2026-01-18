import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon, LoaderIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@weldr/ui/components/field";
import { Input } from "@weldr/ui/components/input";

import { DeleteAlertDialog } from "@/components/delete-alert-dialog";
import { orpc } from "@/lib/orpc";

export function GeneralSection({ project }: { project: RouterOutputs["projects"]["get"] }) {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const updateProject = useMutation(
    orpc.projects.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.projects.get.key({ input: { id: project.id } }),
        });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const deleteProject = useMutation(
    orpc.projects.delete.mutationOptions({
      onSuccess: () => {
        navigate({ to: "/" });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm({
    defaultValues: {
      where: {
        id: project.id,
      },
      payload: {
        title: project.title ?? "",
        subdomain: project.subdomain ?? "",
      },
    },
    validators: {
      onChange: z.object({
        where: z.object({
          id: z.string(),
        }),
        payload: z.object({
          title: z.string(),
          subdomain: z
            .string()
            .min(1, { message: "Subdomain is required" })
            .regex(/^[a-z0-9-]+$/, {
              message: "Must contain only lowercase letters, numbers, and hyphens",
            }),
        }),
      }),
    },
    onSubmit: async ({ value }) => {
      const normalizedValue = {
        ...value,
        payload: {
          ...value.payload,
          title: value.payload.title?.replace(/\s+/g, " ").trim(),
        },
      };
      const result = await updateProject.mutateAsync(normalizedValue);
      form.reset({
        where: {
          id: result.id,
        },
        payload: {
          title: result.title ?? "",
          subdomain: result.subdomain ?? "",
        },
      });
    },
  });

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
            <p className="text-sm text-muted-foreground">General project settings</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="payload.title">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Project Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        placeholder="Enter name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field name="payload.subdomain">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Subdomain</FieldLabel>
                      <div className="relative">
                        <Input
                          id={field.name}
                          name={field.name}
                          placeholder="Enter subdomain"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        <span className="absolute top-[9px] right-2.5 text-xs text-muted-foreground">
                          .weldr.app
                        </span>
                      </div>
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              </form.Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={updateProject.isPending || !form.state.isFormValid || !form.state.isDirty}
              >
                {updateProject.isPending && <LoaderIcon className="mr-2 size-3.5 animate-spin" />}
                Update
              </Button>
            </div>
          </form>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
          <div className="flex flex-col">
            <h3 className="font-medium">Download Project</h3>
            <p className="text-sm text-muted-foreground">Download your project code.</p>
          </div>
          {/* FIXME: Implement download */}
          <Button size="sm" variant="outline">
            <DownloadIcon className="mr-2 size-3.5" />
            Download
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
          <div className="flex flex-col">
            <h3 className="font-medium">Delete Project</h3>
            <p className="text-sm text-muted-foreground">
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
