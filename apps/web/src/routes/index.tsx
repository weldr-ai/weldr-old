import { createFileRoute, Link } from "@tanstack/react-router";

import { buttonVariants } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { UpgradeButton } from "@/components/billing/upgrade-button";
import { CommandCenter } from "@/components/command-center";
import { MainDropdownMenu } from "@/components/main-dropdown-menu";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { getActiveSubscriptionFn } from "@/lib/auth/get-active-subscription-fn";
import { getSessionFn } from "@/lib/auth/get-session-fn";
import { getSessionsFn } from "@/lib/auth/get-sessions-fn";
import { orpc } from "@/lib/orpc";
import { AccountSettings } from "@/routes/auth/-components/account-settings";
import { AuthDialog } from "@/routes/auth/-components/auth-dialog";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await getSessionFn();

    if (!session) {
      return { session: null, sessions: null, activeSubscription: null, projects: [] };
    }

    const [sessions, activeSubscription] = await Promise.all([
      getSessionsFn({ data: { session } }),
      getActiveSubscriptionFn({ data: { session } }),
      context.queryClient.prefetchQuery(orpc.projects.list.queryOptions()),
    ]);

    return { session, sessions, activeSubscription };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { session, activeSubscription } = Route.useRouteContext();

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-between">
      <div className="flex w-full items-center justify-between p-2">
        <MainDropdownMenu session={session} />
        {!session && (
          <div className="flex gap-2">
            <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Home
            </Link>
            <Link to="/pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Pricing
            </Link>
            <Link to="/auth/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Login
            </Link>
            <Link to="/auth/sign-up" className={buttonVariants({ variant: "default", size: "sm" })}>
              Sign Up
            </Link>
          </div>
        )}
      </div>
      <div className="flex w-full flex-col items-center justify-center gap-16">
        <CreateProjectForm session={session} />
      </div>
      <div className="flex w-full items-center justify-between p-2">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Weldr. All rights reserved.
        </p>
        <div className="flex items-center gap-2">
          <a
            href="https://discord.gg/rWwHazMJzE"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-xs text-muted-foreground hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
          <a
            href="https://twitter.com/weldr_ai"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-xs text-muted-foreground hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            X/Twitter
          </a>
          <a
            href="https://www.linkedin.com/company/weldr"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-fit p-0 text-xs text-muted-foreground hover:text-foreground hover:no-underline",
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
        </div>
      </div>
      {!activeSubscription && session && (
        <div className="absolute right-2 bottom-2 z-50 flex w-64 items-center justify-between gap-2 rounded-lg border bg-muted p-2 text-xs">
          <h3 className="font-semibold">Upgrade to Pro</h3>
          <UpgradeButton>Upgrade</UpgradeButton>
        </div>
      )}
      <AccountSettings session={session} activeSubscription={activeSubscription} />
      {session && <CommandCenter session={session} />}
      <AuthDialog />
    </div>
  );
}
