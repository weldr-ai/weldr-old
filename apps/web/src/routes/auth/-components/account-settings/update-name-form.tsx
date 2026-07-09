import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";

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

import { authClient } from "@/lib/auth/client";

const updateNameSchema = z.object({
  name: z
    .string()
    .min(2, {
      message: "Name must be at least 2 characters.",
    })
    .max(50, {
      message: "Name cannot be longer than 50 characters.",
    })
    .regex(/^[a-zA-Z\s'-]+$/, {
      message: "Name can only contain letters, spaces, hyphens and apostrophes.",
    }),
});

export function UpdateNameForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const session = await authClient.getSession();
      return session.data;
    },
  });

  const form = useForm({
    defaultValues: {
      name: session?.user.name ?? "",
    },
    validators: {
      onChange: updateNameSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.updateUser({
        name: value.name,
        fetchOptions: {
          onRequest: () => {
            setIsSubmitting(true);
          },
          onResponse: () => {
            setIsSubmitting(false);
          },
          onSuccess: () => {
            toast.success("Name updated", {
              description: "Your name has been updated successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ["session"] });
          },
          onError: (ctx) => {
            toast.error("Failed to update name", {
              description: ctx.error?.message,
            });
          },
        },
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Enter your full name or display name you want to use.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      placeholder="Enter your name"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      disabled={isSubmitting}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting || !form.state.isFormValid || !form.state.isDirty}
            >
              {isSubmitting && <LoaderIcon className="mr-2 size-4 animate-spin" />}
              Update
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
