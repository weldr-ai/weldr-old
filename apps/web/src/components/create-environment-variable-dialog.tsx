"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, LoaderIcon, PlusIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

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

import { orpc } from "@/lib/orpc/client";

export function CreateEnvironmentVariableDialog({ children }: { children?: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showValue, setShowValue] = useState(false);

  const form = useForm<z.infer<typeof insertEnvironmentVariableSchema>>({
    mode: "onChange",
    resolver: zodResolver(insertEnvironmentVariableSchema),
    defaultValues: {
      key: "",
      value: "",
      projectId,
    },
  });

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
        toast({
          title: "Error",
          variant: "destructive",
          description: error.message,
          duration: 2000,
        });
      },
    }),
  );

  const onSubmit = async (data: z.infer<typeof insertEnvironmentVariableSchema>) => {
    createEnvironmentVariable.mutate({
      value: data.value,
      key: data.key,
      projectId,
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline">
            <PlusIcon className="mr-2 size-3.5" />
            Add Variable
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Environment Variable</DialogTitle>
          <DialogDescription>Add a new environment variable to your project.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter key" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showValue ? "text" : "password"}
                        placeholder="Enter value"
                        {...field}
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={!form.formState.isValid}>
                {createEnvironmentVariable.isPending && (
                  <LoaderIcon className="size-4 animate-spin" />
                )}
                Add Environment Variable
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
