"use client";

import { LoaderIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { authClient } from "@weldr/auth/client";
import { Button } from "@weldr/ui/components/button";
import { toast } from "@weldr/ui/hooks/use-toast";
import { GithubIcon, GoogleIcon } from "@weldr/ui/icons";

import { useUIStore } from "@/lib/context/ui-store";

export function Socials({ asDialog }: { asDialog: boolean }) {
  const { resolvedTheme } = useTheme();
  const { setAuthDialogOpen } = useUIStore();
  const [isSubmitting, setIsSubmitting] = useState<"github" | "microsoft" | "google" | null>(null);

  async function onSocialSignIn(provider: "github" | "microsoft" | "google") {
    await authClient.signIn.social({
      provider,
      callbackURL: "/",
      fetchOptions: {
        onResponse: () => {
          setIsSubmitting(null);
        },
        onRequest: () => {
          setIsSubmitting(provider);
        },
        onSuccess: () => {
          if (asDialog) {
            setAuthDialogOpen(false);
          }
        },
        onError: (ctx) => {
          toast({
            title: "Failed to sign in",
            description: ctx.error?.message,
            variant: "destructive",
          });
        },
      },
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        className="w-full"
        variant="outline"
        size="icon"
        aria-disabled={isSubmitting !== null}
        disabled={isSubmitting !== null}
        onClick={() => onSocialSignIn("google")}
      >
        {isSubmitting === "google" ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        <span className="sr-only">Google Logo</span>
      </Button>
      <Button
        className="w-full"
        variant="outline"
        size="icon"
        aria-disabled={isSubmitting !== null}
        disabled={isSubmitting !== null}
        onClick={() => onSocialSignIn("github")}
      >
        {isSubmitting === "github" ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <GithubIcon className="size-4" theme={resolvedTheme as "light" | "dark"} />
        )}
        <span className="sr-only">Github Logo</span>
      </Button>
    </div>
  );
}
