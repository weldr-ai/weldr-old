"use client";

import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@weldr/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@weldr/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";

import { EnvSection } from "./env-section";
import { GeneralSection } from "./general-section";
import { IntegrationsSection } from "./integrations-section";

export function ProjectSettings({
  project,
  integrationTemplates,
  environmentVariables,
}: {
  project: RouterOutputs["projects"]["byId"];
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.navigator?.userAgent.toLowerCase().includes("mac");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="size-7 dark:bg-muted">
              <SettingsIcon className="size-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="border bg-background dark:bg-muted">
          <p>Project Settings</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="flex min-h-[calc(100vh-50px)] min-w-[calc(100vw-50px)] flex-col">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general" className="flex flex-1 flex-row gap-4">
          <TabsList className="flex h-fit w-[230px] flex-col p-2.5">
            <TabsTrigger className="w-full justify-start" value="general">
              General
            </TabsTrigger>
            <TabsTrigger className="w-full justify-start" value="integrations">
              Integrations
            </TabsTrigger>
            <TabsTrigger className="w-full justify-start" value="env">
              Environment Variables
            </TabsTrigger>
          </TabsList>

          <div className="flex-1">
            <TabsContent value="general" className="mt-0 space-y-4">
              <GeneralSection project={project} />
            </TabsContent>

            <TabsContent
              value="integrations"
              className="mt-0 h-[calc(100vh-134px)] overflow-hidden"
            >
              <IntegrationsSection
                integrationTemplates={integrationTemplates}
                integrations={project.integrations}
                environmentVariables={environmentVariables}
              />
            </TabsContent>

            <TabsContent value="env" className="mt-0">
              <EnvSection environmentVariables={environmentVariables} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
