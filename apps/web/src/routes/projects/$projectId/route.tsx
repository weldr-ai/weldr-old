import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { Spinner } from "@weldr/ui/components/spinner";

import { CommandCenter } from "@/components/command-center";
import { getSessionFn } from "@/lib/auth/get-session-fn";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/projects/$projectId")({
  beforeLoad: async ({ context }) => {
    const session = await getSessionFn();

    if (!session) {
      throw redirect({ to: "/auth/sign-in" });
    }

    await context.queryClient.prefetchQuery(orpc.projects.list.queryOptions());

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

  return (
    <>
      <main className="flex size-full h-screen">
        <div className="size-full flex-1 bg-background dark:bg-muted">
          <Outlet />
        </div>
      </main>
      <CommandCenter session={session} />
    </>
  );
}
