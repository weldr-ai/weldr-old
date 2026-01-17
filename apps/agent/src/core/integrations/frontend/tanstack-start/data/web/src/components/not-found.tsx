import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, HomeIcon, SearchIcon } from "lucide-react";

import { Button } from "@repo/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";
import { Separator } from "@repo/web/components/ui/separator";

export function NotFound() {
  const { history } = useRouter();
  const hasHistory = history.length > 1;

  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <SearchIcon className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <CardTitle className="font-bold text-3xl">404</CardTitle>
              <CardDescription className="text-lg">
                Page Not Found
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm">
              Sorry, we couldn't find the page you're looking for. It might have
              been moved, deleted, or you entered the wrong URL.
            </p>

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                asChild
                variant="default"
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
              If you believe this is an error, please contact support.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
