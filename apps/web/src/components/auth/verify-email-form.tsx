"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@weldr/ui/components/button";
import { LogoIcon } from "@weldr/ui/icons";
import { cn } from "@weldr/ui/lib/utils";

export function VerifyEmailForm({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-2", className)}>
      <LogoIcon className="size-20" />
      <h3 className="text-xl">Email verified successfully!</h3>
      <div className="flex flex-col items-center justify-center">
        <p>Your email has been verified.</p>
        <Link href="/" className={cn(buttonVariants({ variant: "default" }), "mt-4")}>
          Start Building!
        </Link>
      </div>
      <span className="font-semibold">{email}</span>
    </div>
  );
}
