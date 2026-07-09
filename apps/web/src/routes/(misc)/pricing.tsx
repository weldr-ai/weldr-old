import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { buttonVariants } from "@weldr/ui/components/button";
import { WeldrLogo } from "@weldr/ui/components/logos/weldr";
import { Spinner } from "@weldr/ui/components/spinner";
import { cn } from "@weldr/ui/lib/utils";

import { SubscriptionPlans } from "@/components/billing/subscription-plans";
import { MainDropdownMenu } from "@/components/main-dropdown-menu";
import { getActiveSubscriptionFn } from "@/lib/auth/get-active-subscription-fn";
import { getSessionFn } from "@/lib/auth/get-session-fn";

export const Route = createFileRoute("/(misc)/pricing")({
  beforeLoad: async ({ context }) => {
    const session = await getSessionFn();

    if (session) {
      const activeSubscription = await getActiveSubscriptionFn({ data: { session } });
      context.queryClient.setQueryData(["activeSubscription"], activeSubscription);
    }

    return { session };
  },
  pendingComponent: () => (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const getActiveSubscription = useServerFn(getActiveSubscriptionFn);

  const { data: activeSubscription } = useQuery({
    queryKey: ["activeSubscription"],
    queryFn: () => getActiveSubscription({ data: { session } }),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="z-50 flex w-full items-center justify-between p-2">
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
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-2">
        <div className="flex flex-col items-center justify-center gap-2">
          <WeldrLogo className="size-12" />
          <h1 className="text-2xl font-bold">Pricing</h1>
        </div>
        <p className="max-w-lg text-center text-muted-foreground">
          Choose a plan that works best for you and start building today.
        </p>
        <SubscriptionPlans activeSubscription={activeSubscription ?? null} session={session} />
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
    </div>
  );
}
