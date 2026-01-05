import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";

import { CommandCenter } from "@/components/command-center";
import { api } from "@/lib/trpc/server";

export default async function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const projects = await api.projects.list();

    return (
      <>
        <main className="flex size-full h-screen">
          <div className="size-full flex-1 bg-background dark:bg-muted">
            {children}
          </div>
        </main>

        <CommandCenter projects={projects} />
        {/* </ResourcesProvider> */}
      </>
    );
  } catch (error) {
    console.error(error);
    if (error instanceof TRPCError) {
      switch (error.code) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: notFound function already returns
        case "NOT_FOUND":
          notFound();
        case "UNAUTHORIZED":
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: redirect function already returns
        case "FORBIDDEN":
          redirect("/auth/sign-in");
        default:
          return <div>Error</div>;
      }
    }
    return <div>Error</div>;
  }
}
