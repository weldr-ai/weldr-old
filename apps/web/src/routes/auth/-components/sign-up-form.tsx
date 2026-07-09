import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { signUpSchema } from "@weldr/shared/validators/auth";
import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@weldr/ui/components/field";
import { Input } from "@weldr/ui/components/input";
import { WeldrLogo } from "@weldr/ui/components/logos/weldr";
import { cn } from "@weldr/ui/lib/utils";

import { authClient } from "@/lib/auth/client";
import { Socials } from "./socials";
import { SupportLinks } from "./support-links";

export function SignUpForm({
  className,
  isDialog,
  onSwitchToSignIn,
}: {
  className?: string;
  isDialog?: boolean;
  onSwitchToSignIn?: () => void;
}) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email({
        name: `${value.firstName} ${value.lastName}`,
        email: value.email,
        password: value.password,
        fetchOptions: {
          onResponse: () => {
            setIsSubmitting(false);
          },
          onRequest: () => {
            setIsSubmitting(true);
          },
          onError: (ctx) => {
            toast.error("Failed to sign up", {
              description: ctx.error?.message,
            });
          },
          onSuccess: () => {
            navigate({ to: "/" });
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
          <span className="text-xl">Sign up to Weldr</span>
        </CardTitle>
        <CardDescription className="text-center">
          Welcome! Please fill in the details to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Socials disabled={isSubmitting || form.state.isSubmitting} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border border-t" />
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
            <div className="flex flex-col gap-4 md:flex-row md:gap-2">
              <form.Field name="firstName">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid} className="size-full">
                      <FieldLabel htmlFor={field.name}>First name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        placeholder="Your first name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        disabled={isSubmitting || form.state.isSubmitting}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field name="lastName">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid} className="size-full">
                      <FieldLabel htmlFor={field.name}>Last name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        placeholder="Your last name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        disabled={isSubmitting || form.state.isSubmitting}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              </form.Field>
            </div>
            <form.Field name="email">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      placeholder="Your email address"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
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
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showPassword ? "text" : "password"}
                        placeholder="Your password"
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
            <form.Field name="confirmPassword">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Confirm password</FieldLabel>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
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
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={isSubmitting || form.state.isSubmitting}
                      >
                        {showConfirmPassword ? (
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
          </FieldGroup>
          <Button
            className="w-full"
            type="submit"
            aria-disabled={!form.state.isFormValid || isSubmitting || form.state.isSubmitting}
            disabled={!form.state.isFormValid || isSubmitting || form.state.isSubmitting}
          >
            {(isSubmitting || form.state.isSubmitting) && (
              <LoaderIcon className="mr-1 size-3 animate-spin" />
            )}
            Sign up
          </Button>
        </form>
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row md:gap-0">
          <div className="flex items-center gap-1">
            Have an account?{" "}
            {isDialog && onSwitchToSignIn ? (
              <button
                type="button"
                onClick={onSwitchToSignIn}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            ) : (
              <Link to="/auth/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            )}
          </div>
          {!isDialog && <SupportLinks />}
        </div>
      </CardContent>
    </Card>
  );
}
