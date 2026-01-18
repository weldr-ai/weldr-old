"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { adjectives, animals, colors, uniqueNamesGenerator } from "unique-names-generator";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@weldr/ui/components/alert-dialog";
import { toast } from "@weldr/ui/hooks/use-toast";

import { orpc } from "@/lib/orpc/client";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  snapshotId: string;
  snapshotNumber: number;
  branchType: "variant" | "stream";
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  projectId,
  snapshotId,
  snapshotNumber,
  branchType,
}: CreateBranchDialogProps) {
  const router = useRouter();

  const generatedName = useMemo(() => {
    const randomName = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: "-",
      length: 3,
      style: "lowerCase",
    });
    return `${branchType}/${randomName}`;
  }, [branchType]);

  const createBranch = useMutation(
    orpc.branches.create.mutationOptions({
      onSuccess: (branch) => {
        onOpenChange(false);
        // Navigate to the new branch
        router.push(`/projects/${projectId}/branches/${branch.id}`);
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[450px]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Create {branchType === "variant" ? "Variant" : "Stream"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Create a new branch from snapshot #{snapshotNumber}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5 rounded-lg border bg-muted/50 px-3 py-2">
          <p className="text-muted-foreground text-xs">Temporary name</p>
          <code className="block rounded bg-background px-2 py-1 font-mono text-xs">
            {generatedName}
          </code>
          <p className="text-muted-foreground text-xs">
            AI will suggest a better name when you start.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={createBranch.isPending} className="h-8">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-8"
            onClick={() =>
              createBranch.mutate({
                projectId,
                name: generatedName,
                fromSnapshotId: snapshotId,
              })
            }
            disabled={createBranch.isPending}
          >
            {createBranch.isPending && <Loader2Icon className="size-4 animate-spin" />}
            Create
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
