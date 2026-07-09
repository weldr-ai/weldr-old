import { createFileRoute, Link } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { cn } from "@weldr/ui/lib/utils";

import { SupportLinks } from "@/routes/auth/-components/support-links";

export const Route = createFileRoute("/auth/forget-password/confirm")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg border-hidden bg-transparent p-8 shadow-none md:border-solid md:bg-card md:shadow-sm",
      )}
    >
      <CardHeader className="flex flex-col items-start justify-start">
        <CardTitle className="flex flex-col gap-4">
          <div className="size-10" />
          <span className="text-xl">Check your email</span>
        </CardTitle>
        <CardDescription>
          We&apos;ve sent a password reset link to your email address. Please check your inbox and
          click the link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row md:gap-0">
          <div>
            Remember your password?{" "}
            <Link to="/auth/sign-in" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
          <SupportLinks />
        </div>
      </CardContent>
    </Card>
  );
}
