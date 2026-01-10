import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@weldr/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { LogoIcon } from "@weldr/ui/icons";

import { SupportLinks } from "@/components/auth/support-links";

export default async function ForgotPasswordConfirmPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center">
      <Card className="mx-auto w-full max-w-lg border-hidden bg-transparent p-8 shadow-none md:border-solid md:bg-card md:shadow-sm">
        <CardHeader className="flex flex-col items-start justify-start">
          <CardTitle className="flex flex-col gap-4">
            <LogoIcon className="size-10" />
            <span className="text-xl">Check your email</span>
          </CardTitle>
          <CardDescription>
            We've sent you an email with a link to reset your password. Please check your inbox and
            follow the instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-between gap-2 text-muted-foreground text-xs md:flex-row md:gap-0">
            <div>
              Remember your password?{" "}
              <Link href="/auth/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
            <SupportLinks />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
