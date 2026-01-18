import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getSessionFn } from "@/lib/auth/get-session-fn";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const session = await getSessionFn();

    if (session) {
      throw redirect({ to: "/" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Outlet />
    </div>
  );
}
