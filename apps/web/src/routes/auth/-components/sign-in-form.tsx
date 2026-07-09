import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { signInSchema } from "@weldr/shared/validators/auth";
import { Badge } from "@weldr/ui/components/badge";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { Checkbox } from "@weldr/ui/components/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@weldr/ui/components/field";
import { Input } from "@weldr/ui/components/input";
import { WeldrLogo } from "@weldr/ui/components/logos/weldr";
import { cn } from "@weldr/ui/lib/utils";

import { authClient } from "@/lib/auth/client";
import { Socials } from "./socials";
import { SupportLinks } from "./support-links";

export function SignInForm({
  className,
  isDialog,
  onSwitchToSignUp,
}: {
  className?: string;
  isDialog?: boolean;
  onSwitchToSignUp?: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const lastMethod = authClient.getLastUsedLoginMethod();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    validators: {
      onChange: signInSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email({
        email: value.email,
        password: value.password,
        rememberMe: value.rememberMe,
        callbackURL: "/",
        fetchOptions: {
          onResponse: () => {
            setIsSubmitting(false);
          },
          onRequest: () => {
            setIsSubmitting(true);
          },
          onError: (ctx) => {
            toast.error("Failed to sign in", {
              description: ctx.error?.message,
            });
          },
        },
      });
    },
  });

  return (
    <Card
      className={cn(
        "mx-auto w-full max-w-lg border-hidden bg-transparent p-8 shadow-none md:border-solid md:bg-card md:shadow-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-col items-start justify-start">
        <CardTitle className="flex flex-col gap-4">
          <WeldrLogo className="size-10" />
          <span className="text-xl">Sign in to Weldr</span>
        </CardTitle>
        <CardDescription className="text-center">
          Welcome back! Please sign in to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Socials disabled={isSubmitting || form.state.isSubmitting} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground md:bg-card">OR</span>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <FieldGroup>
            <form.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      placeholder="Enter your email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                      disabled={isSubmitting || form.state.isSubmitting}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="password">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <Link
                        to="/auth/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        className="pr-10"
                        disabled={isSubmitting || form.state.isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isSubmitting || form.state.isSubmitting}
                      >
                        {showPassword ? (
                          <EyeOffIcon className="size-3" />
                        ) : (
                          <EyeIcon className="size-3" />
                        )}
                      </Button>
                    </div>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="rememberMe">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field orientation="horizontal" data-invalid={isInvalid}>
                    <Checkbox
                      id={field.name}
                      name={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked: boolean) => {
                        field.handleChange(checked);
                      }}
                      aria-invalid={isInvalid}
                      disabled={isSubmitting || form.state.isSubmitting}
                    />
                    <FieldLabel htmlFor={field.name} className="font-normal">
                      Remember me
                    </FieldLabel>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>
          <Button
            className="relative w-full"
            type="submit"
            disabled={isSubmitting || form.state.isSubmitting}
          >
            {(isSubmitting || form.state.isSubmitting) && (
              <LoaderIcon className="mr-1 size-3 animate-spin" />
            )}
            Sign in
            {lastMethod === "email" && (
              <Badge variant="outline" className="absolute right-2">
                Last used
              </Badge>
            )}
          </Button>
        </form>
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row md:gap-0">
          <div>
            No account?{" "}
            {isDialog && onSwitchToSignUp ? (
              <button
                type="button"
                onClick={onSwitchToSignUp}
                className="text-primary hover:underline"
              >
                Sign up
              </button>
            ) : (
              <Link to="/auth/sign-up" className="text-primary hover:underline">
                Sign up
              </Link>
            )}
          </div>
          {!isDialog && <SupportLinks />}
        </div>
      </CardContent>
    </Card>
  );
}
