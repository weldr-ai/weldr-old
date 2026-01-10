"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import type { RouterOutputs } from "@weldr/api";
import { Button } from "@weldr/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@weldr/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@weldr/ui/components/popover";
import { cn } from "@weldr/ui/lib/utils";

import { getIntegrationIcon } from "../shared/utils";

type IntegrationTemplate = RouterOutputs["integrationTemplates"]["list"][0];

interface IntegrationsComboboxProps {
  integrations: IntegrationTemplate[];
  selectedIntegration: IntegrationTemplate | null;
  onSelectIntegration: (integration: IntegrationTemplate) => void;
  categoryName: string;
}

export function IntegrationsCombobox({
  integrations,
  selectedIntegration,
  onSelectIntegration,
  categoryName,
}: IntegrationsComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          size="sm"
          className="flex-1 justify-between gap-2 pr-1"
        >
          <div className="flex min-w-0 items-center gap-2">
            {selectedIntegration ? (
              <>
                {getIntegrationIcon(selectedIntegration.key, 4)}
                <span className="truncate">{selectedIntegration.name}</span>
              </>
            ) : (
              <span className="truncate">{`Select ${categoryName} integration...`}</span>
            )}
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[448px] p-0">
        <Command>
          <CommandInput placeholder={`Search ${categoryName} integrations...`} />
          <CommandList>
            <CommandEmpty>No integrations found.</CommandEmpty>
            <CommandGroup>
              {integrations.map((integration) => (
                <CommandItem
                  className="h-8"
                  key={integration.id}
                  value={integration.name}
                  onSelect={() => {
                    onSelectIntegration(integration);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedIntegration?.id === integration.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex items-center gap-2">
                    {getIntegrationIcon(integration.key)}
                    <span>{integration.name}</span>
                  </div>
                  {integration.isRecommended && (
                    <span className="ml-auto text-muted-foreground text-xs">Recommended</span>
                  )}
                </CommandItem>
              ))}
              <CommandItem disabled className="h-8 justify-center">
                <span className="text-muted-foreground text-xs italic">
                  More integrations coming soon...
                </span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
