"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { toast } from "@weldr/ui/hooks/use-toast";

import { CreateEnvironmentVariableDialog } from "@/components/create-environment-variable-dialog";
import { DeleteAlertDialog } from "@/components/delete-alert-dialog";
import { useTRPC } from "@/lib/trpc/react";

export function EnvSection({
  environmentVariables,
}: {
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const deleteEnvironmentVariable = useMutation(
    trpc.environmentVariables.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.environmentVariables.list.queryFilter({
            projectId,
          }),
        );
        setDeleteDialogOpen(false);
      },
      onError: (error) => {
        console.error(error);
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
      },
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Environment Variables</span>
          <CreateEnvironmentVariableDialog />
        </CardTitle>
        <CardDescription>Manage your project environment variables</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {environmentVariables.map((envVar) => (
            <div key={envVar.id} className="flex items-center justify-between">
              <span>{envVar.key}</span>
              <Button variant="ghost" size="icon" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2Icon className="size-4 text-destructive" />
              </Button>
              <DeleteAlertDialog
                open={deleteDialogOpen}
                setOpen={setDeleteDialogOpen}
                onDelete={() => {
                  deleteEnvironmentVariable.mutate({ id: envVar.id });
                }}
                isPending={deleteEnvironmentVariable.isPending}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
