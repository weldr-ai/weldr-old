import * as Sentry from "@sentry/tanstackstart-react";
import { Fragment, useEffect } from "react";
import { toast } from "sonner";

function ErrorFallback({ error, resetError }: { error: unknown; resetError: () => void }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred";

  useEffect(() => {
    toast.error("Something went wrong", {
      description: message,
      action: {
        label: "Try again",
        onClick: resetError,
      },
      duration: Infinity,
    });
  }, [message, resetError]);

  return <Fragment />;
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={ErrorFallback}
      onError={(_error, componentStack) => {
        Sentry.setContext("react_error_boundary", {
          componentStack,
          location: typeof window !== "undefined" ? window.location.href : "server",
          timestamp: new Date().toISOString(),
        });
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
