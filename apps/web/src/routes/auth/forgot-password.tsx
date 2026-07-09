import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/routes/auth/-components/forgot-password-form";

export const Route = createFileRoute("/auth/forgot-password")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ForgotPasswordForm />;
}
