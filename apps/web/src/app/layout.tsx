import { ReactFlowProvider } from "@xyflow/react";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { Toaster } from "@weldr/ui/components/toaster";
import { TooltipProvider } from "@weldr/ui/components/tooltip";
import { cn } from "@weldr/ui/lib/utils";

import { QueryProvider } from "@/components/query-client-provider";
import { UIStoreProvider } from "@/lib/context/ui-store";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { HydrateClient } from "@/lib/trpc/server";

import "@/lib/shutdown";
import "@weldr/ui/styles/globals.css";

const fontSans = Poppins({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = Poppins({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Weldr",
  description:
    "Build full-stack apps, LLM agents and workflow automation in minutes!",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "flex min-h-screen w-full flex-col font-sans antialiased",
          fontSans.variable,
          fontMono.variable,
        )}
      >
        <UIStoreProvider>
          <TRPCReactProvider>
            <QueryProvider>
              <HydrateClient>
                <TooltipProvider delayDuration={200}>
                  <ReactFlowProvider>
                    <NextThemesProvider
                      attribute="class"
                      defaultTheme="system"
                      enableSystem
                      disableTransitionOnChange
                      enableColorScheme
                    >
                      {children}
                      <Toaster />
                    </NextThemesProvider>
                  </ReactFlowProvider>
                </TooltipProvider>
              </HydrateClient>
            </QueryProvider>
          </TRPCReactProvider>
        </UIStoreProvider>
      </body>
    </html>
  );
}
