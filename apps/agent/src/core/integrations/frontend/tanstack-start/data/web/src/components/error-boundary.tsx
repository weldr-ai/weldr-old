import { Link, useRouter } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  HomeIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@repo/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";
import { Separator } from "@repo/web/components/ui/separator";

interface ErrorBoundaryProps {
  error: Error;
  reset?: () => void;
  info?: {
    componentStack?: string;
  };
}

export function ErrorBoundary({ error, reset, info }: ErrorBoundaryProps) {
  const { history } = useRouter();
  const hasHistory = history.length > 1;
  const [showDetails, setShowDetails] = useState(false);

  // Log error to console for debugging
  useEffect(() => {
    console.error("Error Boundary caught an error:", error);
    if (info?.componentStack) {
      console.error("Component stack:", info.componentStack);
    }
  }, [error, info]);

  const handleRefresh = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
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
              <CardTitle className="font-bold text-2xl text-destructive">
                Something went wrong
              </CardTitle>
              <CardDescription className="text-base">
                An unexpected error occurred
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm">
              We apologize for the inconvenience. The application encountered an
              error and couldn't complete your request.
            </p>

            {process.env.NODE_ENV === "development" && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs"
                >
                  {showDetails ? "Hide" : "Show"} Error Details
                </Button>
                {showDetails && (
                  <div className="rounded-md bg-muted p-3 text-left">
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium text-sm">Error Message:</p>
                        <p className="font-mono text-destructive text-xs">
                          {error.message}
                        </p>
                      </div>
                      {error.stack && (
                        <div>
                          <p className="font-medium text-sm">Stack Trace:</p>
                          <pre className="max-h-32 overflow-auto font-mono text-xs">
                            {error.stack}
                          </pre>
                        </div>
                      )}
                      {info?.componentStack && (
                        <div>
                          <p className="font-medium text-sm">
                            Component Stack:
                          </p>
                          <pre className="max-h-64 overflow-auto font-mono text-xs">
                            {info.componentStack}
                          </pre>
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
                className="flex items-center gap-2"
              >
                <RefreshCwIcon className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                asChild
                variant="outline"
                className="flex items-center gap-2"
              >
                <Link to="/">
                  <HomeIcon className="h-4 w-4" />
                  Go Home
                </Link>
              </Button>
              {hasHistory && (
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => history.back()}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Go Back
                </Button>
              )}
            </div>

            <div className="text-muted-foreground text-xs">
              If this problem persists, please contact support with the error
              details above.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
