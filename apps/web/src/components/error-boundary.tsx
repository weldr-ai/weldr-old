import * as Sentry from "@sentry/tanstackstart-react";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangleIcon, ArrowLeftIcon, CopyIcon, HomeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { Separator } from "@weldr/ui/components/separator";

function ErrorFallback({ error, resetError }: { error: unknown; resetError: () => void }) {
  const { history } = useRouter();
  const hasHistory = history.length > 1;
  const [showDetails, setShowDetails] = useState(false);

  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  const stack = error instanceof Error ? error.stack : undefined;

  // Log error to console for debugging
  useEffect(() => {
    console.error("Error Boundary caught an error:", error);
    if (stack) {
      console.error("Stack trace:", stack);
    }
  }, [error, stack]);

  // Show toast for production
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

  const handleRefresh = () => {
    resetError();
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <div className="flex min-h-[60vh] min-w-[500px] items-center justify-center p-4">
        <Card className="w-full text-center">
          <CardHeader className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangleIcon className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold text-destructive">
                Something went wrong
              </CardTitle>
              <CardDescription className="text-base">An unexpected error occurred</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              We apologize for the inconvenience. The application encountered an error and couldn't
              complete your request.
            </p>

            {import.meta.env.DEV && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-xs"
                  >
                    {showDetails ? "Hide" : "Show"} Error Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${message}\n\n${stack ?? ""}`);
                      toast.success("Error details copied to clipboard");
                    }}
                    className="flex items-center gap-1 text-xs"
                  >
                    <CopyIcon className="h-3 w-3" />
                    Copy Error
                  </Button>
                </div>
                {showDetails && (
                  <div className="rounded-md bg-muted p-3 text-left">
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">Error Message:</p>
                        <p className="font-mono text-xs text-destructive">{message}</p>
                      </div>
                      {stack && (
                        <div>
                          <p className="text-sm font-medium">Stack Trace:</p>
                          <pre className="max-h-32 overflow-auto font-mono text-xs">{stack}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={handleRefresh}
                variant="default"
                className="flex cursor-pointer items-center gap-2"
              >
                <RefreshCwIcon className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                render={<Link to="/" />}
                variant="outline"
                className="flex cursor-pointer items-center gap-2"
              >
                <HomeIcon className="h-4 w-4" />
                Go Home
              </Button>
              {hasHistory && (
                <Button
                  variant="outline"
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => history.back()}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Go Back
                </Button>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              If this problem persists, please contact support with the error details above.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
