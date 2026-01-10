"use client";

import { Dialog, DialogContent, DialogTitle } from "@weldr/ui/components/dialog";
import { VisuallyHidden } from "@weldr/ui/components/visually-hidden";

import { useUIStore } from "@/lib/context/ui-store";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

export function AuthDialog() {
  const { authDialogOpen, setAuthDialogOpen, authDialogView } = useUIStore();

  return (
    <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
      <DialogContent className="h-fit w-full max-w-md border-none p-0">
        <VisuallyHidden asChild>
          <DialogTitle>Sign in or sign up</DialogTitle>
        </VisuallyHidden>
        {authDialogView === "sign-in" ? <SignInForm asDialog /> : <SignUpForm asDialog />}
      </DialogContent>
    </Dialog>
  );
}
