import { createFileRoute } from "@tanstack/react-router";

import { SignInForm } from "@/routes/auth/-components/sign-in-form";

export const Route = createFileRoute("/auth/sign-in")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SignInForm />;
}
