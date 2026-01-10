"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import type { RouterOutputs } from "@weldr/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";
import { ScrollArea } from "@weldr/ui/components/scroll-area";

import { CreateIntegrationDialog } from "@/components/integrations/create-integration-dialog";
import { useTRPC } from "@/lib/trpc/react";

export function IntegrationsSection({
  integrationTemplates,
  integrations: initialIntegrations,
  environmentVariables,
}: {
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  integrations: RouterOutputs["projects"]["byId"]["integrations"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const trpc = useTRPC();

  const { data: integrations } = useQuery(
    trpc.integrations.list.queryOptions(
      {
        projectId,
      },
      {
        initialData: initialIntegrations,
      },
    ),
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>Manage your workspace integrations</CardDescription>
      </CardHeader>
      <CardContent className="h-full">
        <ScrollArea className="h-[calc(100%-65px)]">
          <div className="grid size-full grid-cols-3 gap-4 pb-6">
            {integrationTemplates.map((integrationTemplate) => (
              <CreateIntegrationDialog
                key={integrationTemplate.id}
                integrationTemplate={
                  integrationTemplate as RouterOutputs["integrationTemplates"]["byId"]
                }
                integration={integrations?.find(
                  (integration) => integration.integrationTemplate.id === integrationTemplate.id,
                )}
                environmentVariables={environmentVariables}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
