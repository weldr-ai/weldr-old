"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { authClient } from "@weldr/auth/client";
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

  const form = useForm<z.infer<typeof updateEmailSchema>>({
    mode: "onChange",
    resolver: zodResolver(updateEmailSchema),
    defaultValues: {
      email: session?.user.email ?? "",
    },
  });

  async function onSubmit(values: z.infer<typeof updateEmailSchema>) {
    await authClient.changeEmail({
      newEmail: values.email,
      fetchOptions: {
        onRequest: () => {
          setIsSubmitting(true);
        },
        onResponse: () => {
          setIsSubmitting(false);
        },
        onSuccess: () => {
          toast({
            title: "Email update initiated",
            description: "Please check your new email for verification.",
          });
          queryClient.invalidateQueries({ queryKey: ["session"] });
        },
        onError: (ctx: { error?: { message: string } }) => {
          toast({
            title: "Failed to update email",
            description: ctx.error?.message,
            variant: "destructive",
          });
        },
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Email</CardTitle>
        <CardDescription>
          Update your email address. A confirmation email will be sent to verify the new email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter your new email"
                      type="email"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSubmitting || !form.formState.isValid || !form.formState.isDirty}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
