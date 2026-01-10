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

export function UpdateNameForm({
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

  const form = useForm<z.infer<typeof updateNameSchema>>({
    resolver: zodResolver(updateNameSchema),
    defaultValues: {
      name: session?.user.name ?? "",
    },
  });

  async function onSubmit(values: z.infer<typeof updateNameSchema>) {
    await authClient.updateUser({
      name: values.name,
      fetchOptions: {
        onRequest: () => {
          setIsSubmitting(true);
        },
        onResponse: () => {
          setIsSubmitting(false);
        },
        onSuccess: () => {
          toast({
            title: "Name updated",
            description: "Your name has been updated successfully.",
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
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Enter your full name or display name you want to use.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your name" {...field} disabled={isSubmitting} />
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
