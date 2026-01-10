import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon, Undo2Icon } from "lucide-react";

import type { RouterOutputs } from "@weldr/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@weldr/ui/components/alert-dialog";
import { Button, buttonVariants } from "@weldr/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";
import { toast } from "@weldr/ui/hooks/use-toast";

import { useTRPC } from "@/lib/trpc/react";

export function RevertVersionDialog({
  version,
  onScrollToVersion,
}: {
  version: RouterOutputs["branches"]["byIdOrMain"]["versions"][number];
  onScrollToVersion: (versionId: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const revertMutation = useMutation(
    trpc.versions.revert.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries(
          trpc.branches.byIdOrMain.queryFilter({
            id: version.branchId,
            projectId: version.projectId,
          }),
        );

        const previousData = queryClient.getQueryData(
          trpc.branches.byIdOrMain.queryKey({
            id: version.branchId,
            projectId: version.projectId,
          }),
        );

        const revertedVersionId = `temp-${Date.now()}`;
        const revertedVersion: RouterOutputs["branches"]["byIdOrMain"]["versions"][number] = {
          id: revertedVersionId,
          userId: version.userId,
          branchId: version.branchId,
          projectId: version.projectId,
          number: version.number + 1,
          sequenceNumber: version.sequenceNumber + 1,
          message: `revert: revert to #${version.sequenceNumber} ${version.message}`,
          description: `Reverted from #${version.sequenceNumber} ${version.message}`,
          status: "completed",
          kind: "revert",
          createdAt: new Date(),
          publishedAt: new Date(),
          appliedFromBranchId: null,
          revertedVersionId: version.id,
          appliedFromBranch: null,
          revertedVersion: {
            id: version.id,
            sequenceNumber: version.sequenceNumber,
            message: version.message,
          },
        };

        queryClient.setQueryData(
          trpc.branches.byIdOrMain.queryKey({
            id: version.branchId,
            projectId: version.projectId,
          }),
          (old: RouterOutputs["branches"]["byIdOrMain"] | undefined) => {
            if (!old) return old;
            return {
              ...old,
              versions: [revertedVersion, ...old.versions],
            };
          },
        );

        onScrollToVersion(revertedVersionId);

        return { previousData, revertedVersionId };
      },
      onError: (error, _variables, context) => {
        // Rollback on error
        if (context?.previousData) {
          queryClient.setQueryData(
            trpc.branches.byIdOrMain.queryKey({
              id: version.branchId,
              projectId: version.projectId,
            }),
            context.previousData,
          );
        }

        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
      },
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Version reverted successfully.",
          duration: 2000,
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.branches.byIdOrMain.queryFilter({
            id: version.branchId,
            projectId: version.projectId,
          }),
        );
      },
    }),
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 rounded-sm text-destructive hover:text-destructive"
            >
              <Undo2Icon className="size-3" />
              <span className="sr-only">Revert to this version</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="border bg-muted text-xs">
            Revert to this version
          </TooltipContent>
        </Tooltip>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revert to this version</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription>
          Are you sure you want to revert to this version?
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revertMutation.isPending} className="h-8">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={revertMutation.isPending}
            className={buttonVariants({
              variant: "destructive",
              size: "sm",
            })}
            onClick={() => {
              revertMutation.mutate({
                projectId: version.projectId,
                versionId: version.id,
              });
            }}
          >
            {revertMutation.isPending ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <Undo2Icon className="size-3" />
            )}
            Revert
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
