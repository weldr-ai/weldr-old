import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/routes/auth/-components/reset-password-form";

const resetPasswordSearchSchema = z.object({
  token: z.string(),
});

export const Route = createFileRoute("/auth/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { token } = Route.useSearch();

  return <ResetPasswordForm token={token} />;
}
