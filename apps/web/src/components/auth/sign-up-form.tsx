"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { authClient } from "@weldr/auth/client";
import { signUpSchema } from "@weldr/shared/validators/auth";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
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

export function SignUpForm({
  asDialog = false,
  className,
}: {
  asDialog?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { setAuthDialogView } = useUIStore();

  const form = useForm<z.infer<typeof signUpSchema>>({
    mode: "onChange",
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: z.infer<typeof signUpSchema>) {
    await authClient.signUp.email({
      name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      password: data.password,
      fetchOptions: {
        onResponse: () => {
          setIsSubmitting(false);
        },
        onRequest: () => {
          setIsSubmitting(true);
        },
        onError: (ctx) => {
          toast({
            title: "Failed to sign up",
            description: ctx.error?.message,
            variant: "destructive",
          });
        },
        onSuccess: () => {
          router.push("/");
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
          <span className="text-xl">Sign up to Weldr</span>
        </CardTitle>
        <CardDescription className="text-center">
          Welcome! Please fill in the details to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Socials asDialog={asDialog} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground md:bg-card">OR</span>
          </div>
        </div>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Form {...form}>
            <div className="flex flex-col gap-4 md:flex-row md:gap-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem className="size-full">
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Your first name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem className="size-full">
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Your last name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Your email address" />
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder="Your password"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1 right-1 size-7"
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
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1 right-1 size-7"
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

            <Button
              className="w-full"
              type="submit"
              aria-disabled={!form.formState.isValid || isSubmitting}
              disabled={!form.formState.isValid || isSubmitting}
            >
              {isSubmitting && <LoaderIcon className="mr-1 size-3 animate-spin" />}
              Sign up
            </Button>
          </Form>
        </form>
        <div className="flex flex-col items-center justify-between gap-2 text-muted-foreground text-xs md:flex-row md:gap-0">
          <div className="flex items-center gap-1">
            Have an account?{" "}
            {asDialog ? (
              <Button
                variant="link"
                className="p-0 text-primary text-xs hover:underline"
                onClick={() => setAuthDialogView("sign-in")}
              >
                Sign in
              </Button>
            ) : (
              <Link href="/auth/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            )}
          </div>
          <SupportLinks />
        </div>
      </CardContent>
    </Card>
  );
}
