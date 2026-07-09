import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { resetPasswordSchema } from "@weldr/shared/validators/auth";
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
import { SupportLinks } from "./support-links";

export function ResetPasswordForm({ className, token }: { className?: string; token: string }) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: resetPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      await authClient.resetPassword({
        newPassword: value.password,
        token,
        fetchOptions: {
          onResponse: () => {
            setIsSubmitting(false);
          },
          onRequest: () => {
            setIsSubmitting(true);
          },
          onError: (ctx) => {
            toast.error("Failed to reset password", {
              description: ctx.error?.message,
            });
          },
          onSuccess: () => {
            toast.success("Password reset successfully");
            navigate({ to: "/auth/sign-in" });
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
          <span className="text-xl">Create new password</span>
        </CardTitle>
        <CardDescription>Please enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <FieldGroup>
            <form.Field name="password">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>New Password</FieldLabel>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
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
                    <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
                    <div className="relative">
                      <Input
                        id={field.name}
                        name={field.name}
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
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
            Reset password
          </Button>
        </form>
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
