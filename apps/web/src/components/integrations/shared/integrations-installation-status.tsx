import { LoaderIcon } from "lucide-react";

import { cn } from "@weldr/ui/lib/utils";

import { getIntegrationIcon } from "../shared/utils";
import type { IntegrationToolMessage, IntegrationToolOutput } from "./types";

export function IntegrationsInstallationStatus({ message }: { message: IntegrationToolMessage }) {
  const output = message.content[0]?.output as IntegrationToolOutput;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted p-2">
      {output.value.status === "cancelled" && (
        <span className="font-medium text-muted-foreground text-xs">
          <span className="text-foreground">Integrations installation</span> cancelled
        </span>
      )}
      {output.value.status === "completed" && (
        <>
          <h4 className="font-medium text-foreground text-xs">Integrations Installation</h4>
          {output.value.integrations?.map((integration) => (
            <div
              key={integration.key}
              className="flex h-8 items-center justify-between gap-2 rounded-md border bg-muted px-3 pr-1"
            >
              <div className="flex min-w-0 items-center gap-2">
                {getIntegrationIcon(integration.key, 4)}
                {integration.name}
              </div>
              <div
                className={cn(
                  "flex h-fit items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5",
                  "shrink-0 font-medium text-[0.65rem] text-muted-foreground",
                )}
              >
                {integration.status === "installing" ? (
                  <LoaderIcon className="size-3 animate-spin text-primary" />
                ) : (
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      integration.status === "queued" && "bg-warning",
                      integration.status === "installed" && "bg-success",
                      integration.status === "failed" && "bg-destructive",
                      integration.status === "cancelled" && "bg-muted-foreground",
                    )}
                  />
                )}
                {integration.status.charAt(0).toUpperCase() + integration.status.slice(1)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
