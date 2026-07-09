import { toast } from "sonner";

import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { authClient } from "@/lib/auth/client";

export function UpgradeButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button
      variant="default"
      size="sm"
      className={cn("h-7 text-xs", className)}
      onClick={async () =>
        await authClient.subscription.upgrade({
          plan: "pro",
          successUrl: import.meta.env.VITE_WEB_URL,
          cancelUrl: import.meta.env.VITE_WEB_URL + "/billing",
          fetchOptions: {
            onError: (_: unknown) => {
              toast.error("Error upgrading subscription", {
                description: "An unknown error occurred",
              });
            },
          },
        })
      }
    >
      {children}
    </Button>
  );
}
