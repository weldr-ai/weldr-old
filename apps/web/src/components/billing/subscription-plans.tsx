import type { Subscription } from "@better-auth/stripe";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";

import type { Session } from "@weldr/auth";
import { Badge } from "@weldr/ui/components/badge";
import { buttonVariants } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { cn } from "@weldr/ui/lib/utils";

import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { RestoreSubscriptionButton } from "./restore-subscription-button";
import { UpgradeButton } from "./upgrade-button";

export function SubscriptionPlans({
  activeSubscription,
  session,
}: {
  activeSubscription: Subscription | null;
  session: Session | null;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 md:flex-row">
      <Card className="w-full max-w-sm gap-4">
        <CardHeader>
          <CardTitle className="flex flex-col gap-2">
            <span className="pb-1 text-sm font-medium">Free</span>
            <span className="block text-2xl font-semibold">$0 / mo</span>
          </CardTitle>
          <CardDescription className="text-sm">For getting started</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link
            to="/auth/sign-up"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          >
            Get Started
          </Link>
          <ul className="list-outside space-y-3 text-sm">
            {["Limited to 1 project", "2 generations per day"].map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <CheckIcon className="size-3" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="w-full max-w-sm gap-4">
        <CardHeader>
          <CardTitle className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pro</span>
              <Badge variant="outline">Popular</Badge>
            </div>
            <span className="block text-2xl font-semibold">$25 / mo</span>
          </CardTitle>
          <CardDescription className="text-sm">For more generations and projects</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session && !activeSubscription ? (
            <Link
              to="/auth/sign-up"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-full")}
            >
              Get Started
            </Link>
          ) : session && !activeSubscription ? (
            <UpgradeButton
              className={cn(
                buttonVariants({
                  variant: "default",
                  size: "sm",
                }),
                "w-full",
              )}
            >
              Get Started
            </UpgradeButton>
          ) : session && activeSubscription?.cancelAtPeriodEnd ? (
            <RestoreSubscriptionButton className="w-full" />
          ) : session && !activeSubscription?.cancelAtPeriodEnd ? (
            <CancelSubscriptionButton className="w-full" />
          ) : null}
          <ul className="list-outside space-y-3 text-sm">
            {["Unlimited projects", "Unlimited generations per day"].map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <CheckIcon className="size-3" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
