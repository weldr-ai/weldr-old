import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, LoaderIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { insertEnvironmentVariableSchema } from "@weldr/shared/validators/environment-variables";
import { Button } from "@weldr/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@weldr/ui/components/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@weldr/ui/components/field";
import { Input } from "@weldr/ui/components/input";

import { orpc } from "@/lib/orpc";

export function CreateEnvironmentVariableDialog({
  projectId,
  children,
}: {
  projectId: string;
  children?: React.ReactNode;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showValue, setShowValue] = useState(false);

  const queryClient = useQueryClient();

  const createEnvironmentVariable = useMutation(
    orpc.environmentVariables.create.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.environmentVariables.list.key({ input: { projectId } }),
        });
        if (data.id) {
          setIsDialogOpen(false);
          form.reset();
        }
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm({
    defaultValues: {
      key: "",
      value: "",
      projectId,
    },
    validators: {
      onChange: insertEnvironmentVariableSchema,
    },
    onSubmit: async ({ value }) => {
      createEnvironmentVariable.mutate({
        value: value.value,
        key: value.key,
        projectId,
      });
    },
  });

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          children ? (
            <Button variant="outline">
              <PlusIcon className="mr-2 size-3.5" />
              Add Variable
            </Button>
          ) : (
            <></>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Environment Variable</DialogTitle>
          <DialogDescription>Add a new environment variable to your project.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <FieldGroup>
            <form.Field name="key">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Key</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder="Enter key"
                      autoComplete="off"
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
            <form.Field name="value">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Value</FieldLabel>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showValue ? "text" : "password"}
                        placeholder="Enter value"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 z-10 size-7 rounded-sm"
                        onClick={() => setShowValue(!showValue)}
                      >
                        {showValue ? (
                          <EyeOffIcon className="size-3.5" />
                        ) : (
                          <EyeIcon className="size-3.5" />
                        )}
                      </Button>
                    </div>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={!form.state.isFormValid}>
              {createEnvironmentVariable.isPending && (
                <LoaderIcon className="mr-2 size-4 animate-spin" />
              )}
              Add Environment Variable
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
