import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ReactFlowProvider } from "@xyflow/react";
import { ThemeProvider } from "better-themes";
import { Toaster } from "sonner";

import { TooltipProvider } from "@weldr/ui/components/tooltip";
import appCss from "@weldr/ui/globals.css?url";

import { UIStoreProvider } from "@/lib/context/ui-store";
import { seo } from "@/lib/seo";
import { ErrorBoundary } from "../components/error-boundary";
import { NotFound } from "../components/not-found";
import TanStackQueryDevtools from "../lib/tanstack-query/devtools";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...seo({
        title: "Weldr - Build full-stack apps, LLM agents and workflow automation in minutes!",
        description: "Weldr is a platform for creating and managing your projects.",
        keywords: "full-stack apps, LLM agents, workflow automation",
        image: import.meta.env.VITE_WEB_URL + "/icon.png",
        url: import.meta.env.VITE_WEB_URL,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/icon.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-icon.png", sizes: "180x180" },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen w-full flex-col font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UIStoreProvider>
            <TooltipProvider>
              <ReactFlowProvider>
                {children}
                <Toaster />
                <TanStackDevtools
                  config={{
                    position: "bottom-left",
                  }}
                  plugins={[
                    {
                      name: "Tanstack Router",
                      render: <TanStackRouterDevtoolsPanel />,
                    },
                    TanStackQueryDevtools,
                  ]}
                />
              </ReactFlowProvider>
            </TooltipProvider>
          </UIStoreProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
