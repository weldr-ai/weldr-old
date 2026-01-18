import { LoaderIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@weldr/ui/components/alert-dialog";
import { Button } from "@weldr/ui/components/button";
import { Input } from "@weldr/ui/components/input";

export function DeleteAlertDialog({
  open,
  setOpen,
  onDelete,
  isPending = false,
  confirmText = "DELETE",
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onDelete: () => void;
  isPending?: boolean;
  confirmText?: string;
}) {
  const [typedText, setTypedText] = useState("");

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmText && (
          <div className="flex flex-col gap-2">
            <Input
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={confirmText}
            />
            <p className="text-xs text-muted-foreground">
              Type <span className="font-bold">{confirmText}</span> to confirm
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={typedText !== confirmText || isPending}
            onClick={onDelete}
            variant="destructive"
          >
            {isPending && <LoaderIcon className="mr-2 size-3.5 animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
