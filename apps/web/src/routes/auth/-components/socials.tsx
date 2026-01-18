import { LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@weldr/ui/components/badge";
import { Button } from "@weldr/ui/components/button";
import { GithubLogo } from "@weldr/ui/logos/github";
import { GoogleLogo } from "@weldr/ui/logos/google";
import { MicrosoftLogo } from "@weldr/ui/logos/microsoft";

import { authClient } from "@/lib/auth/client";

const providers = [
  {
    name: "google",
    logo: GoogleLogo,
  },
  {
    name: "microsoft",
    logo: MicrosoftLogo,
  },
  {
    name: "github",
    logo: GithubLogo,
  },
] as const;

type Provider = "google" | "microsoft" | "github";

export function Socials({ disabled }: { disabled?: boolean }) {
  const [isSubmitting, setIsSubmitting] = useState<Provider | null>(null);
  const lastMethod = authClient.getLastUsedLoginMethod();

  async function onSocialSignIn(provider: Provider) {
    await authClient.signIn.social({
      provider,
      callbackURL: import.meta.env.VITE_WEB_URL + "/",
      fetchOptions: {
        onResponse: () => {
          setIsSubmitting(null);
        },
        onRequest: () => {
          setIsSubmitting(provider);
        },
        onError: (ctx) => {
          toast.error("Failed to sign in", {
            description: ctx.error?.message,
          });
        },
      },
    });
  }

  return (
    <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
      {providers.map((provider) => (
        <Button
          key={provider.name}
          className="relative w-full"
          variant="outline"
          aria-disabled={isSubmitting !== null || disabled}
          disabled={isSubmitting !== null || disabled}
          onClick={() => onSocialSignIn(provider.name)}
        >
          {isSubmitting === provider.name ? (
            <LoaderIcon className="mr-2 size-4 animate-spin" />
          ) : (
            <provider.logo className="size-4" />
          )}
          <span className="block md:hidden">
            Sign in with {provider.name.charAt(0).toUpperCase() + provider.name.slice(1)}
          </span>
          {lastMethod === provider.name && (
            <Badge variant="outline" className="absolute right-2">
              Last used
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
