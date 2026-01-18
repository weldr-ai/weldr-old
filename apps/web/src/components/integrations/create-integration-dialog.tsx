import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { RouterOutputs } from "@weldr/api";
import { Badge } from "@weldr/ui/components/badge";
import { Button } from "@weldr/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@weldr/ui/components/dialog";

import { IntegrationConfigurationFields } from "@/components/integrations/shared";
import { orpc } from "@/lib/orpc";
import { getIntegrationIcon } from "./shared/utils";

export function CreateIntegrationDialog({
  projectId,
  integrationTemplate,
  integration,
  environmentVariables,
}: {
  projectId: string;
  integrationTemplate: RouterOutputs["integrationTemplates"]["get"];
  integration?: RouterOutputs["integrations"]["list"][number];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const requiredVariables = integrationTemplate.variables || [];

  // Build dynamic validation schema based on required variables
  const validationSchemaShape: Record<string, z.ZodString> = {
    projectId: z.string(),
    integrationId: z.string(),
    name: z.string().min(1, "Name is required"),
  };

  for (const variable of requiredVariables) {
    validationSchemaShape[variable.name] = z.string().min(1, `${variable.name} is required`);
  }

  const validationSchema = z.object(validationSchemaShape);

  // Build default values
  const defaultValues: Record<string, string> = {
    projectId,
    integrationId: integrationTemplate.id,
    name: integration?.name ?? "",
  };

  for (const variable of requiredVariables) {
    defaultValues[variable.name] =
      integration?.environmentVariableMappings?.find((mapping) => mapping.mapTo === variable.name)
        ?.environmentVariableId ?? "";
  }

  const addIntegrationMutation = useMutation(
    orpc.integrations.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Integration created successfully.");
        setDialogOpen?.(false);
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.key() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateIntegrationMutation = useMutation(
    orpc.integrations.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Integration updated successfully.");
        setDialogOpen?.(false);
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.key() });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm({
    defaultValues,
    validators: {
      onChange: validationSchema,
    },
    onSubmit: async ({ value }) => {
      const environmentVariableMappings = requiredVariables
        .map((variable) => ({
          envVarId: value[variable.name] as string,
          configKey: variable.name,
        }))
        .filter((mapping) => mapping.envVarId);

      if (integration) {
        await updateIntegrationMutation.mutateAsync({
          where: { id: integration.id },
          payload: {
            name: value.name,
            environmentVariableMappings,
          },
        });
      } else {
        await addIntegrationMutation.mutateAsync({
          projectId,
          name: value.name,
          integrationTemplateId: integrationTemplate.id,
          environmentVariableMappings,
        });
      }
    },
  });

  // Watch form values for the shared component
  const formValues = useStore(form.store, (state) => state.values);

  // Build environment variable mappings object for the shared component
  const environmentVariableMappings: Record<string, string> = {};
  for (const variable of requiredVariables) {
    environmentVariableMappings[variable.name] = formValues[variable.name] ?? "";
  }

  // Sync form field values when mappings change
  const handleEnvironmentVariableMapping = (configKey: string, envVarId: string) => {
    form.setFieldValue(configKey, envVarId);
  };

  const handleNameChange = (name: string) => {
    form.setFieldValue("name", name);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="flex size-80 w-full flex-col items-start justify-between gap-4 p-6"
          >
            <div className="flex w-full flex-col items-start gap-4">
              <div className="flex w-full justify-between">
                <div className="flex flex-col items-start gap-4">
                  {getIntegrationIcon(integrationTemplate.key, 10)}
                  <span className="text-lg font-semibold">{integrationTemplate.name}</span>
                </div>
                {integration?.integrationTemplate.id === integrationTemplate.id && (
                  <CheckCircle2Icon className="size-4 text-green-500" />
                )}
              </div>
              <span className="text-start text-wrap text-muted-foreground">
                {integrationTemplate.description}
              </span>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-2">
              {integrationTemplate.category.key.toLocaleUpperCase()}
            </Badge>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{integration ? integration.name : "Add new integration"}</DialogTitle>
          <DialogDescription>
            {integration
              ? `Enter your ${integration.name} then press add.`
              : "Select an integration to add an integration."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex w-full flex-col space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <IntegrationConfigurationFields
            projectId={projectId}
            integrationTemplate={integrationTemplate}
            environmentVariables={environmentVariables}
            environmentVariableMappings={environmentVariableMappings}
            onEnvironmentVariableMapping={handleEnvironmentVariableMapping}
            name={formValues.name ?? ""}
            onNameChange={handleNameChange}
            showNameField
          />
          <div className="flex w-full justify-end">
            <Button
              type="submit"
              disabled={
                addIntegrationMutation.isPending ||
                updateIntegrationMutation.isPending ||
                !form.state.isFormValid ||
                !form.state.isDirty
              }
            >
              {addIntegrationMutation.isPending && (
                <LoaderIcon className="mr-1 size-3 animate-spin" />
              )}
              {updateIntegrationMutation.isPending && (
                <LoaderIcon className="mr-1 size-3 animate-spin" />
              )}
              {integration ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
