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

const updateEmailSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
});

export function UpdateEmailForm({
  session: initialSession,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session", initialSession.session.id],
    queryFn: async () => {
      const session = await authClient.getSession();
      return session.data;
    },
    initialData: initialSession,
  });

  const form = useForm({
    defaultValues: {
      email: session?.user.email ?? "",
    },
    validators: {
      onChange: updateEmailSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.changeEmail({
        newEmail: value.email,
        fetchOptions: {
          onRequest: () => {
            setIsSubmitting(true);
          },
          onResponse: () => {
            setIsSubmitting(false);
          },
          onSuccess: () => {
            toast.success("Email update initiated", {
              description: "Please check your new email for verification.",
            });
            queryClient.invalidateQueries({ queryKey: ["session"] });
          },
          onError: (ctx) => {
            toast.error("Failed to update email", {
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
        <CardTitle>Change Email</CardTitle>
        <CardDescription>
          Update your email address. A confirmation email will be sent to verify the new email.
        </CardDescription>
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
            <form.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      placeholder="Enter your new email"
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
