"use client";

import { authClient } from "@weldr/auth/client";
import { Button } from "@weldr/ui/components/button";
import { toast } from "@weldr/ui/hooks/use-toast";
import { cn } from "@weldr/ui/lib/utils";

export function RestoreSubscriptionButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("w-full", className)}
      onClick={async () => {
        await authClient.subscription.restore({
          fetchOptions: {
            onError: (error) => {
              console.error(error);
              toast({
                variant: "destructive",
                title: "Error restoring subscription",
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
