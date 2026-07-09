import { Dialog, DialogContent, DialogTitle } from "@weldr/ui/components/dialog";

import { useUIStore } from "@/lib/context/ui-store";
import { SignInForm } from "@/routes/auth/-components/sign-in-form";
import { SignUpForm } from "@/routes/auth/-components/sign-up-form";

export function AuthDialog() {
  const { authDialogOpen, setAuthDialogOpen, authDialogView, setAuthDialogView } = useUIStore();

  return (
    <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
      <DialogContent className="h-fit w-full max-w-md border-none p-0">
        <DialogTitle className="sr-only">Sign in or sign up</DialogTitle>
        {authDialogView === "sign-in" ? (
          <SignInForm isDialog onSwitchToSignUp={() => setAuthDialogView("sign-up")} />
        ) : (
          <SignUpForm isDialog onSwitchToSignIn={() => setAuthDialogView("sign-in")} />
        )}
      </DialogContent>
    </Dialog>
  );
}
