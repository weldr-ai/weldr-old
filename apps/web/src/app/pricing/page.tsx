import { headers } from "next/headers";
import Link from "next/link";

import { auth } from "@weldr/auth";
import { buttonVariants } from "@weldr/ui/components/button";
import { LogoIcon } from "@weldr/ui/icons";
import { cn } from "@weldr/ui/lib/utils";

import { SubscriptionPlans } from "@/components/billing/subscription-plans";
import { MainDropdownMenu } from "@/components/main-dropdown-menu";
import { getActiveSubscription } from "@/lib/actions/get-active-subscription";

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const activeSubscription = await getActiveSubscription();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="z-50 flex w-full items-center justify-between p-2">
        <MainDropdownMenu />
        {!session && (
          <div className="flex gap-2">
            {!session && (
              <>
                <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Home
                </Link>
                <Link href="/pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Pricing
                </Link>
              </>
            )}
            <Link href="/auth/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Login
            </Link>
            <Link
              href="/auth/sign-up"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-2">
        <div className="flex flex-col items-center justify-center gap-2">
          <LogoIcon className="size-12" />
          <h1 className="font-bold text-2xl">Pricing</h1>
        </div>
        <p className="max-w-lg text-center text-muted-foreground">
          Choose a plan that works best for you and start building today.
        </p>
        <SubscriptionPlans activeSubscription={activeSubscription} session={session} />
      </div>
      <div className="flex w-full items-center justify-between p-2">
        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} Weldr. All rights reserved.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="https://discord.gg/rWwHazMJzE"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-muted-foreground text-xs hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </Link>
          <Link
            href="https://twitter.com/weldr_ai"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-muted-foreground text-xs hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            X/Twitter
          </Link>
          <Link
            href="https://www.linkedin.com/company/weldr"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-muted-foreground text-xs hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </Link>
        </div>
      </div>
    </div>
  );
}
