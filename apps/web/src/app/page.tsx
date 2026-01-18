import { headers } from "next/headers";
import Link from "next/link";

import { auth } from "@weldr/auth";
import { buttonVariants } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { AccountSettings } from "@/components/auth/account-settings";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { CommandCenter } from "@/components/command-center";
import { MainDropdownMenu } from "@/components/main-dropdown-menu";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { api } from "@/lib/orpc/client";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const sessions = session ? await auth.api.listSessions({ headers: await headers() }) : null;
  const projects = session ? await api.projects.list() : [];
  const subscriptions = await auth.api.listActiveSubscriptions({
    headers: await headers(),
  });

  const activeSubscription = subscriptions.find(
    (subscription) => subscription.status === "active" || subscription.status === "trialing",
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-between">
      <div className="flex w-full items-center justify-between p-2">
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
      <div className="flex w-full flex-col items-center justify-center gap-16">
        <CreateProjectForm session={session} />
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
      {!activeSubscription && session && (
        <div className="absolute right-2 bottom-2 z-50 flex w-64 items-center justify-between gap-2 rounded-lg border bg-muted p-2 text-xs">
          <h3 className="font-semibold">Upgrade to Pro</h3>
          <UpgradeButton>Upgrade</UpgradeButton>
        </div>
      )}
      <AccountSettings
        session={session}
        sessions={sessions}
        activeSubscription={activeSubscription ?? null}
      />
      {session && <CommandCenter projects={projects} />}
      <AuthDialog />
    </div>
  );
}
