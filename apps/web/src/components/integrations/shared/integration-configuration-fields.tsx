import { CheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@weldr/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@weldr/ui/components/command";
import { Input } from "@weldr/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@weldr/ui/components/popover";
import { cn } from "@weldr/ui/lib/utils";

import { CreateEnvironmentVariableDialog } from "@/components/create-environment-variable-dialog";
import type { IntegrationConfigurationProps } from "./types";

export function IntegrationConfigurationFields({
  projectId,
  integrationTemplate,
  environmentVariables,
  environmentVariableMappings,
  onEnvironmentVariableMapping,
  name,
  onNameChange,
  showNameField = false,
}: IntegrationConfigurationProps) {
  const [envVarPopoverStates, setEnvVarPopoverStates] = useState<Record<string, boolean>>({});

  const requiredVariables = integrationTemplate.variables || [];

  const toggleEnvVarPopover = (variableName: string, isOpen: boolean) => {
    setEnvVarPopoverStates((prev) => ({
      ...prev,
      [variableName]: isOpen,
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      {showNameField && onNameChange && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="integration-name" className="text-xs font-medium">
            Name
          </label>
          <Input
            id="integration-name"
            value={name || ""}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter friendly name for your integration"
            autoComplete="off"
          />
        </div>
      )}

      {requiredVariables.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {requiredVariables.map((variable) => (
            <div
              key={variable.name}
              className="grid grid-cols-2 items-center gap-0 space-y-0 gap-y-2 text-xs"
            >
              <div className="flex h-9 items-center rounded-l-md border-y border-l px-3">
                {variable.name}
              </div>
              <div className="flex">
                <Popover
                  open={envVarPopoverStates[variable.name] || false}
                  onOpenChange={(isOpen) => toggleEnvVarPopover(variable.name, isOpen)}
                >
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between rounded-l-none text-xs"
                      >
                        {environmentVariableMappings[variable.name]
                          ? environmentVariables.find(
                              (env) => env.id === environmentVariableMappings[variable.name],
                            )?.key
                          : "Select environment variable"}
                      </Button>
                    }
                  />
                  <PopoverContent className="w-[230px] p-0">
                    <Command>
                      <CommandInput
                        className="h-8 text-xs"
                        placeholder="Search environment variables..."
                      />
                      <CommandList className="min-h-[150px] overflow-y-auto">
                        <CommandEmpty className="text-xs">
                          No environment variables found.
                        </CommandEmpty>
                        <CommandGroup>
                          {environmentVariables.map((env) => (
                            <CommandItem
                              key={env.id}
                              value={env.key}
                              onSelect={() => {
                                onEnvironmentVariableMapping(variable.name, env.id);
                                toggleEnvVarPopover(variable.name, false);
                              }}
                              className="text-xs"
                            >
                              <CheckIcon
                                className={cn(
                                  "mr-1.5 size-3.5 opacity-0",
                                  env.id === environmentVariableMappings[variable.name] &&
                                    "opacity-100",
                                )}
                              />
                              {env.key}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                    <CreateEnvironmentVariableDialog projectId={projectId}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start rounded-none rounded-b-md border-x-0 border-b-0 text-xs"
                      >
                        <PlusIcon className="mr-1 size-3.5" />
                        Add new environment
                      </Button>
                    </CreateEnvironmentVariableDialog>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
