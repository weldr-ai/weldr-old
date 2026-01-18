import { toast } from "sonner";

import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { authClient } from "@/lib/auth/client";

export function CancelSubscriptionButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("w-full", className)}
      onClick={async () => {
        await authClient.subscription.cancel({
          returnUrl: "/",
          fetchOptions: {
            onError: (_error) => {
              toast.error("Error cancelling subscription", {
                description: "An unknown error occurred",
              });
            },
          },
        });
      }}
    >
      Cancel Subscription
    </Button>
  );
}
