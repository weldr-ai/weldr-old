"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { authClient } from "@weldr/auth/client";
import { signInSchema } from "@weldr/shared/validators/auth";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { Checkbox } from "@weldr/ui/components/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@weldr/ui/components/form";
import { Input } from "@weldr/ui/components/input";
import { toast } from "@weldr/ui/hooks/use-toast";
import { LogoIcon } from "@weldr/ui/icons";
import { cn } from "@weldr/ui/lib/utils";

import { useUIStore } from "@/lib/context/ui-store";
import { Socials } from "./socials";
import { SupportLinks } from "./support-links";

export function SignInForm({
  asDialog = false,
  className,
}: {
  asDialog?: boolean;
  className?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { setAuthDialogView } = useUIStore();

  const form = useForm<z.infer<typeof signInSchema>>({
    mode: "onChange",
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: "false",
    },
  });

  async function onSubmit(data: z.infer<typeof signInSchema>) {
    await authClient.signIn.email({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe === "true",
      callbackURL: asDialog ? undefined : "/",
      fetchOptions: {
        onResponse: () => {
          setIsSubmitting(false);
        },
        onRequest: () => {
          setIsSubmitting(true);
        },
        onError: (ctx) => {
          toast({
            title: "Failed to sign in",
            description: ctx.error?.message,
            variant: "destructive",
          });
        },
      },
    });
  }

  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg border-hidden bg-transparent p-8 shadow-none md:border-solid md:bg-card md:shadow-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-col items-start justify-start">
        <CardTitle className="flex flex-col gap-4">
          <LogoIcon className="size-10" />
          <span className="text-xl">Sign in to Weldr</span>
        </CardTitle>
        <CardDescription className="text-center">
          Welcome back! Please sign in to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Socials asDialog={asDialog} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground md:bg-card">OR</span>
          </div>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter your email" required />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link
                      href="/auth/forgot-password"
                      className="text-primary text-xs hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        placeholder="Enter your password"
                        required
                        type={showPassword ? "text" : "password"}
                      />
                      <Button
                        className="absolute top-1 right-1 size-7"
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOffIcon className="size-3" />
                        ) : (
                          <EyeIcon className="size-3" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex w-full items-center gap-2">
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        {...field}
                        checked={field.value === "true"}
                        onCheckedChange={(value) => field.onChange(value ? "true" : "false")}
                      />
                    </FormControl>
                    <FormLabel>Remember me</FormLabel>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              className="w-full"
              type="submit"
              aria-disabled={!form.formState.isValid || isSubmitting}
              disabled={!form.formState.isValid || isSubmitting}
            >
              {isSubmitting && <LoaderIcon className="mr-1 size-3 animate-spin" />}
              Sign in
            </Button>
          </form>
        </Form>
        <div className="flex flex-col items-center justify-between gap-2 text-muted-foreground text-xs md:flex-row md:gap-0">
          <div>
            No account?{" "}
            {asDialog ? (
              <Button
                variant="link"
                className="p-0 text-primary text-xs hover:underline"
                onClick={() => setAuthDialogView("sign-up")}
              >
                Sign up
              </Button>
            ) : (
              <Link href="/auth/sign-up" className="text-primary hover:underline">
                Sign up
              </Link>
            )}
          </div>
          <SupportLinks />
        </div>
      </CardContent>
    </Card>
  );
}
