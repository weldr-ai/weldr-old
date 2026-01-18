"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Form } from "@weldr/ui/components/form";
import { toast } from "@weldr/ui/hooks/use-toast";

import { IntegrationConfigurationFields } from "@/components/integrations/shared";
import { orpc } from "@/lib/orpc/client";
import { getIntegrationIcon } from "./shared/utils";

export function CreateIntegrationDialog({
  integrationTemplate,
  integration,
  environmentVariables,
}: {
  integrationTemplate: RouterOutputs["integrationTemplates"]["get"];
  integration?: RouterOutputs["integrations"]["list"][number];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { projectId } = useParams<{ projectId: string }>();
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

  const form = useForm<z.infer<typeof validationSchema>>({
    mode: "onChange",
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const addIntegrationMutation = useMutation(
    orpc.integrations.create.mutationOptions({
      onSuccess: async () => {
        toast({
          title: "Success",
          description: "Integration created successfully.",
          duration: 2000,
        });
        setDialogOpen?.(false);
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.key() });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
      },
    }),
  );

  const updateIntegrationMutation = useMutation(
    orpc.integrations.update.mutationOptions({
      onSuccess: async () => {
        toast({
          title: "Success",
          description: "Integration updated successfully.",
          duration: 2000,
        });
        setDialogOpen?.(false);
        await queryClient.invalidateQueries({ queryKey: orpc.integrations.list.key() });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
      },
    }),
  );

  const onSubmit = async (data: z.infer<typeof validationSchema>) => {
    const environmentVariableMappings = requiredVariables
      .map((variable) => ({
        envVarId: data[variable.name] as string,
        configKey: variable.name,
      }))
      .filter((mapping) => mapping.envVarId);

    if (integration) {
      await updateIntegrationMutation.mutateAsync({
        where: { id: integration.id },
        payload: {
          name: data.name,
          environmentVariableMappings,
        },
      });
    } else {
      await addIntegrationMutation.mutateAsync({
        projectId,
        name: data.name,
        integrationTemplateId: integrationTemplate.id,
        environmentVariableMappings,
      });
    }
  };

  // Build environment variable mappings object for the shared component
  const environmentVariableMappings: Record<string, string> = {};
  for (const variable of requiredVariables) {
    environmentVariableMappings[variable.name] = form.watch(variable.name);
  }

  // Sync form field values when mappings change
  const handleEnvironmentVariableMapping = (configKey: string, envVarId: string) => {
    form.setValue(configKey, envVarId, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleNameChange = (name: string) => {
    form.setValue("name", name, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex size-80 w-full flex-col items-start justify-between gap-4 p-6"
        >
          <div className="flex w-full flex-col items-start gap-4">
            <div className="flex w-full justify-between">
              <div className="flex flex-col items-start gap-4">
                {getIntegrationIcon(integrationTemplate.key, 10)}
                <span className="font-semibold text-lg">{integrationTemplate.name}</span>
              </div>
              {integration?.integrationTemplate.id === integrationTemplate.id && (
                <CheckCircle2Icon className="size-4 text-green-500" />
              )}
            </div>
            <span className="text-wrap text-start text-muted-foreground">
              {integrationTemplate.description}
            </span>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-2">
            {integrationTemplate.category.key.toLocaleUpperCase()}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{integration ? integration.name : "Add new integration"}</DialogTitle>
          <DialogDescription>
            {integration
              ? `Enter your ${integration.name} then press add.`
              : "Select an integration to add an integration."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex w-full flex-col space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <IntegrationConfigurationFields
              integrationTemplate={integrationTemplate}
              environmentVariables={environmentVariables}
              environmentVariableMappings={environmentVariableMappings}
              onEnvironmentVariableMapping={handleEnvironmentVariableMapping}
              name={form.watch("name")}
              onNameChange={handleNameChange}
              showNameField
            />
            <div className="flex w-full justify-end">
              <Button
                type="submit"
                disabled={
                  addIntegrationMutation.isPending ||
                  updateIntegrationMutation.isPending ||
                  !form.formState.isValid ||
                  !form.formState.isDirty
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
