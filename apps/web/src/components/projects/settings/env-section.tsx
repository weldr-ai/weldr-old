import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";

import { CreateEnvironmentVariableDialog } from "@/components/create-environment-variable-dialog";
import { DeleteAlertDialog } from "@/components/delete-alert-dialog";
import { orpc } from "@/lib/orpc";

export function EnvSection({
  projectId,
  environmentVariables,
}: {
  projectId: string;
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const deleteEnvironmentVariable = useMutation(
    orpc.environmentVariables.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.environmentVariables.list.key({ input: { projectId } }),
        });
        setDeleteDialogOpen(false);
      },
      onError: (error) => {
        console.error(error);
        toast.error(error.message);
      },
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Environment Variables</span>
          <CreateEnvironmentVariableDialog projectId={projectId} />
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
