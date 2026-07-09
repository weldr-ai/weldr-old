import { Link } from "@tanstack/react-router";

import { buttonVariants } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-8xl font-bold text-muted-foreground/20">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <Link className={cn(buttonVariants({ variant: "default" }), "mt-8")} to="/">
          Go back home
        </Link>
      </div>
    </div>
  );
}
