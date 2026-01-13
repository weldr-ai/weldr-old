import { Link, useLoaderData, useRouter } from "@tanstack/react-router";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@repo/web/components/ui/button";
import { authClient } from "@repo/web/lib/auth";
import { ModeToggle } from "./mode-toggle";

export function Header() {
  const { session } = useLoaderData({ from: "__root__" });
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <div className="flex w-full items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2">
        <Link to="/" className="font-semibold">
          Weldr
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {session ? (
          <>
            <Link
              to="/3d"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              3D
            </Link>
            <Link
              to="/todos"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Todos
            </Link>
            <Link
              to="/chat"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              AI
            </Link>
            <Button
              variant="ghost"
              size="sm"
              disabled={isSigningOut}
              onClick={() => {
                authClient.signOut({
                  fetchOptions: {
                    onRequest: () => {
                      setIsSigningOut(true);
                    },
                    onResponse: () => {
                      setIsSigningOut(false);
                    },
                    onError: () => {
                      toast.error("Failed to sign out");
                      setIsSigningOut(false);
                    },
                    onSuccess: () => {
                      router.invalidate();
                    },
                  },
                });
              }}
            >
              {isSigningOut ? (
                <Loader2Icon className="mr-1 size-3.5 animate-spin" />
              ) : (
                <LogOutIcon className="mr-1 size-3.5 text-destructive" />
              )}
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Link
              to="/auth/sign-in"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </Link>
            <Link
              to="/auth/sign-up"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Sign up
            </Link>
          </>
        )}
        <ModeToggle />
      </div>
    </div>
  );
}
