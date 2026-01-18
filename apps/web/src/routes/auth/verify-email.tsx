import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { VerifyEmailForm } from "@/routes/auth/-components/verify-email-form";

const verifyEmailSearchSchema = z.object({
  email: z.string().optional(),
});

export const Route = createFileRoute("/auth/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { email } = Route.useSearch();

  return <VerifyEmailForm email={email} />;
}
