import { useMutation, useQueries } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { AssistantContent } from "ai";
import fastDeepEqual from "fast-deep-equal";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  LoaderIcon,
  PenIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type Dispatch, memo, type SetStateAction, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { RouterOutputs } from "@weldr/api";
import { nanoid } from "@weldr/shared/nanoid";
import type { ChatMessage, IntegrationCategoryKey, TStatus } from "@weldr/shared/types";
import { Button } from "@weldr/ui/components/button";

import { api, orpc } from "@/lib/orpc";
import type { IntegrationToolCall } from "../shared/types";
import { ConfigureIntegrationDialog } from "./configure-integration-dialog";
import { IntegrationsCombobox } from "./integrations-combobox";

type Phase = "configuring" | "installing" | "completed" | "failed";

type CreatedIntegration = {
  id: string;
  installationId: string;
  key: string;
  name: string;
  status: string;
};

const PureConfigureIntegrationsPrompt = ({
  message,
  chatId,
  setMessages,
  integrationTemplates,
  environmentVariables,
  project,
  setStatus,
  branchId,
}: {
  message: ChatMessage;
  chatId: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  integrationTemplates: RouterOutputs["integrationTemplates"]["list"];
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  project: RouterOutputs["projects"]["get"];
  setStatus: Dispatch<SetStateAction<TStatus>>;
  branchId: string;
}) => {
  const { projectId } = useParams({ strict: false }) as { projectId: string };

  const messageContent = message.content as Exclude<AssistantContent, string>;

  const integrationToolCall = messageContent.find(
    (part) =>
      part.type === "tool-call" &&
      part.toolName === "add_integrations" &&
      (part.input as { status: "awaiting_config" }).status === "awaiting_config",
  ) as IntegrationToolCall;

  const requiredCategories = integrationToolCall.input.categories;

  const [selectedIntegrations, setSelectedIntegrations] = useState<
    Record<string, RouterOutputs["integrationTemplates"]["list"][0] | null>
  >(
    integrationTemplates.reduce(
      (acc, template) => {
        if (template.isRecommended && requiredCategories.includes(template.category.key)) {
          acc[template.category.key] = template;
        }
        return acc;
      },
      {} as Record<string, RouterOutputs["integrationTemplates"]["list"][0] | null>,
    ),
  );

  const [categoryChange, setCategoryChange] = useState<IntegrationCategoryKey[]>([]);

  // Phase management for the new flow
  const [phase, setPhase] = useState<Phase>("configuring");
  const [createdIntegrations, setCreatedIntegrations] = useState<CreatedIntegration[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [configuredIntegrations, setConfiguredIntegrations] = useState<
    Record<
      string,
      {
        template: RouterOutputs["integrationTemplates"]["list"][0];
        name?: string;
        environmentVariableMappings: Record<string, string>;
        isConfigured: boolean;
      }
    >
  >({});

  const filteredIntegrationTemplates = integrationTemplates.filter(
    (template) =>
      requiredCategories.length === 0 || requiredCategories.includes(template.category.key),
  );

  const groupedTemplates = filteredIntegrationTemplates.reduce(
    (acc, template) => {
      const categoryKey = template.category.key;
      if (!acc[categoryKey]) {
        acc[categoryKey] = {
          category: template.category,
          templates: [],
        };
      }
      acc[categoryKey].templates.push(template);
      return acc;
    },
    {} as Record<
      string,
      {
        category: RouterOutputs["integrationTemplates"]["list"][0]["category"];
        templates: RouterOutputs["integrationTemplates"]["list"];
      }
    >,
  );

  // Poll installation status for each created integration
  const installationQueries = useQueries({
    queries: createdIntegrations.map((integration) => ({
      queryKey: ["installation-status", integration.installationId],
      queryFn: () =>
        api.integrations.getInstallation({ installationId: integration.installationId }),
      enabled: phase === "installing",
      refetchInterval: (query: { state: { data?: { status: string } } }) => {
        const status = query.state.data?.status;
        // Stop polling when installed or failed
        if (status === "installed" || status === "failed") {
          return false;
        }
        return 500; // Fast polling
      },
    })),
  });

  const handleSelectIntegration = (
    categoryKey: string,
    integration: RouterOutputs["integrationTemplates"]["list"][0],
  ) => {
    setSelectedIntegrations((prev) => ({
      ...prev,
      [categoryKey]: integration,
    }));

    const existingIntegrationId = Object.keys(configuredIntegrations).find(
      (id) => configuredIntegrations[id]?.template.category.key === categoryKey,
    );
    if (existingIntegrationId) {
      setConfiguredIntegrations((prev) => {
        const newState = { ...prev };
        delete newState[existingIntegrationId];
        return newState;
      });
    }

    const variables = integration.variables || [];
    const needsConfig = variables.some((v) => v.source === "user");

    if (!needsConfig) {
      setConfiguredIntegrations((prev) => ({
        ...prev,
        [integration.id]: {
          template: integration,
          name: integration.name,
          environmentVariableMappings: {},
          isConfigured: true,
        },
      }));
    }
  };

  const handleEnvironmentVariableMapping = (
    templateId: string,
    configKey: string,
    envVarId: string,
  ) => {
    setConfiguredIntegrations((prev) => {
      const existingIntegration = prev[templateId] || {
        // oxlint-disable-next-line no-non-null-assertion
        template: filteredIntegrationTemplates.find((t) => t.id === templateId)!,
        name: filteredIntegrationTemplates.find((t) => t.id === templateId)?.name,
        environmentVariableMappings: {},
        isConfigured: false,
      };

      return {
        ...prev,
        [templateId]: {
          ...existingIntegration,
          environmentVariableMappings: {
            ...existingIntegration.environmentVariableMappings,
            [configKey]: envVarId,
          },
        },
      };
    });
  };

  const needsUserConfig = useCallback(
    (categoryKey: string): boolean => {
      const integration = selectedIntegrations[categoryKey];
      if (!integration) return false;
      const variables = integration.variables || [];
      return variables.some((v) => v.source === "user");
    },
    [selectedIntegrations],
  );

  const isConfigured = useCallback(
    (categoryKey: string): boolean => {
      const integration = selectedIntegrations[categoryKey];
      if (!integration) return false;

      const variables = integration.variables || [];

      if (variables.length === 0) return true;

      if (variables.every((v) => v.source === "system")) return true;

      const configuredIntegration = configuredIntegrations[integration.id];
      const mappings = configuredIntegration?.environmentVariableMappings || {};

      return variables.filter((v) => v.source === "user").every((v) => mappings[v.name]);
    },
    [selectedIntegrations, configuredIntegrations],
  );

  const handleConfigurationConfirm = (templateId: string) => {
    setConfiguredIntegrations((prev) => {
      const existingIntegration = prev[templateId];
      if (!existingIntegration) return prev;

      return {
        ...prev,
        [templateId]: {
          ...existingIntegration,
          isConfigured: true,
        },
      };
    });
  };

  const handleConfigurationCancel = (templateId: string) => {
    setConfiguredIntegrations((prev) => {
      const newState = { ...prev };
      delete newState[templateId];
      return newState;
    });
  };

  const addMessageMutation = useMutation(
    orpc.chats.addMessage.mutationOptions({
      onSuccess: (data) => {
        setStatus("idle");
        setMessages((prev) => [...prev, data]);
        setStatus("thinking");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  // Check if all installations are complete
  const allInstallationsComplete = installationQueries.every(
    (query) => query.data?.status === "installed" || query.data?.status === "failed",
  );
  const hasFailedInstallations = installationQueries.some(
    (query) => query.data?.status === "failed",
  );
  const allInstallationsSucceeded = installationQueries.every(
    (query) => query.data?.status === "installed",
  );

  // Handle completion - send tool result when all installations are done
  useEffect(() => {
    if (phase !== "installing" || !allInstallationsComplete || installationQueries.length === 0) {
      return;
    }

    if (hasFailedInstallations) {
      setPhase("failed");
      return;
    }

    if (allInstallationsSucceeded) {
      // All done! Send tool result to resume AI
      addMessageMutation.mutate({
        chatId,
        message: {
          id: nanoid(),
          role: "tool",
          createdAt: new Date(),
          content: [
            {
              type: "tool-result",
              toolCallId: integrationToolCall.toolCallId,
              toolName: integrationToolCall.toolName,
              output: {
                type: "json",
                value: {
                  status: "completed",
                  categories: requiredCategories,
                  integrations: installationQueries.map((query) => ({
                    name: query.data?.integration.name ?? "",
                    category:
                      filteredIntegrationTemplates.find(
                        (t) => t.key === query.data?.integration.key,
                      )?.category.key ?? "",
                    key: query.data?.integration.key ?? "",
                    status: query.data?.status ?? "installed",
                  })),
                },
              },
            },
          ],
        },
      });
      setPhase("completed");
    }
  }, [
    phase,
    allInstallationsComplete,
    hasFailedInstallations,
    allInstallationsSucceeded,
    installationQueries,
    addMessageMutation,
    chatId,
    integrationToolCall,
    requiredCategories,
    filteredIntegrationTemplates,
  ]);

  const handleFinalConfirm = useCallback(async () => {
    const configurations = Object.values(selectedIntegrations)
      .filter(
        (integration): integration is NonNullable<typeof integration> =>
          integration !== null && isConfigured(integration.category.key),
      )
      .map((integration) => {
        const configuredIntegration = configuredIntegrations[integration.id];
        return {
          name: configuredIntegration?.name || integration.name,
          integrationTemplateId: integration.id,
          environmentVariableMappings: Object.entries(
            configuredIntegration?.environmentVariableMappings || {},
          ).map(([configKey, envVarId]) => ({
            configKey,
            envVarId,
          })),
        };
      });

    setIsSubmitting(true);

    try {
      // Call the agent endpoint directly
      const response = await fetch("/agent/integrations/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          branchId,
          integrations: configurations,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to setup integrations");
      }

      const result = (await response.json()) as {
        success: boolean;
        integrations: CreatedIntegration[];
      };

      // Store the created integrations and start polling
      setCreatedIntegrations(result.integrations);
      setPhase("installing");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(errorMessage);
      setIsSubmitting(false);
    }
  }, [projectId, branchId, configuredIntegrations, selectedIntegrations, isConfigured]);

  const handleIntegrationCancel = useCallback(() => {
    addMessageMutation.mutate({
      chatId,
      message: {
        id: nanoid(),
        role: "tool",
        createdAt: new Date(),
        content: [
          {
            type: "tool-result",
            toolCallId: integrationToolCall.toolCallId,
            toolName: integrationToolCall.toolName,
            output: {
              type: "json",
              value: {
                status: "cancelled",
                categories: requiredCategories,
              },
            },
          },
        ],
      },
    });
  }, [addMessageMutation, chatId, integrationToolCall, requiredCategories]);

  // Handle retry for failed installations
  const handleRetry = useCallback(async () => {
    const failedInstallations = installationQueries
      .filter((query) => query.data?.status === "failed")
      .map((query) => query.data);

    if (failedInstallations.length === 0) return;

    setPhase("installing");
    // Reset queries to trigger refetch
    for (const query of installationQueries) {
      if (query.data?.status === "failed") {
        query.refetch();
      }
    }
  }, [installationQueries]);

  // Handle continue anyway (with partial results)
  const handleContinueAnyway = useCallback(() => {
    addMessageMutation.mutate({
      chatId,
      message: {
        id: nanoid(),
        role: "tool",
        createdAt: new Date(),
        content: [
          {
            type: "tool-result",
            toolCallId: integrationToolCall.toolCallId,
            toolName: integrationToolCall.toolName,
            output: {
              type: "json",
              value: {
                status: "completed",
                categories: requiredCategories,
                integrations: installationQueries.map((query) => ({
                  name: query.data?.integration.name ?? "",
                  category:
                    filteredIntegrationTemplates.find((t) => t.key === query.data?.integration.key)
                      ?.category.key ?? "",
                  key: query.data?.integration.key ?? "",
                  status: query.data?.status ?? "failed",
                  error: query.data?.installationMetadata?.error,
                })),
              },
            },
          },
        ],
      },
    });
    setPhase("completed");
  }, [
    addMessageMutation,
    chatId,
    integrationToolCall,
    requiredCategories,
    installationQueries,
    filteredIntegrationTemplates,
  ]);

  // Show installation progress
  if (phase === "installing" || phase === "failed" || phase === "completed") {
    return (
      <div className="rounded-md border">
        <div className="flex flex-col items-center border-b p-1.5">
          <h3 className="font-medium">
            {phase === "installing" && "Installing Integrations..."}
            {phase === "failed" && "Installation Failed"}
            {phase === "completed" && "Installation Complete"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {phase === "installing" && "Please wait while integrations are being installed"}
            {phase === "failed" && "Some integrations failed to install"}
            {phase === "completed" && "All integrations have been installed"}
          </p>
        </div>
        <div className="flex flex-col gap-2 p-1.5">
          {createdIntegrations.map((integration, index) => {
            const query = installationQueries[index];
            const status = query?.data?.status ?? "queued";
            const error = query?.data?.installationMetadata?.error;

            return (
              <div key={integration.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{integration.name}</span>
                <div className="flex items-center gap-1.5">
                  {(status === "queued" || status === "installing") && (
                    <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {status === "installed" && <CheckCircleIcon className="size-4 text-green-500" />}
                  {status === "failed" && (
                    <div className="flex items-center gap-1">
                      <AlertCircleIcon className="size-4 text-destructive" />
                      {error && (
                        <span className="text-xs text-destructive" title={error}>
                          Failed
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                </div>
              </div>
            );
          })}

          {phase === "failed" && (
            <div className="flex justify-end gap-1 border-t pt-1.5">
              <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCwIcon className="mr-1 size-3" />
                Retry Failed
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={handleContinueAnyway}>
                Continue Anyway
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show configuration UI (phase === "configuring")
  return (
    <div className="rounded-md border">
      <div className="flex flex-col items-center border-b p-1.5">
        <h3 className="font-medium">Setup Integrations</h3>
        <p className="text-xs text-muted-foreground">
          Select and configure integrations for your project
        </p>
      </div>
      <div className="flex flex-col gap-2 p-1.5">
        {Object.entries(groupedTemplates)
          .toSorted(([, a], [, b]) => {
            const aNeedsConfig = needsUserConfig(a.category.key);
            const bNeedsConfig = needsUserConfig(b.category.key);
            if (aNeedsConfig && !bNeedsConfig) return -1;
            if (!aNeedsConfig && bNeedsConfig) return 1;
            return 0;
          })
          .map(([categoryKey, { category, templates }]) => (
            <div key={categoryKey} className="flex flex-col gap-1">
              <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {category.key}
              </h4>
              <div className="flex w-full items-center gap-1.5">
                {categoryChange.includes(category.key) && (
                  <IntegrationsCombobox
                    integrations={templates}
                    selectedIntegration={selectedIntegrations[categoryKey] || null}
                    onSelectIntegration={(integration) =>
                      handleSelectIntegration(categoryKey, integration)
                    }
                    categoryName={category.key}
                  />
                )}
                {selectedIntegrations[categoryKey] &&
                  !categoryChange.includes(category.key) &&
                  (() => {
                    return (
                      <ConfigureIntegrationDialog
                        integrationTemplate={
                          selectedIntegrations[
                            categoryKey
                          ] as RouterOutputs["integrationTemplates"]["list"][0]
                        }
                        project={project}
                        environmentVariables={environmentVariables}
                        isConfigured={isConfigured(categoryKey)}
                        disabled={!needsUserConfig(categoryKey)}
                        onConfirm={() => {
                          const integration = selectedIntegrations[categoryKey];
                          if (integration) {
                            handleConfigurationConfirm(integration.id);
                          }
                        }}
                        onCancel={() => {
                          const integration = selectedIntegrations[categoryKey];
                          if (integration) {
                            handleConfigurationCancel(integration.id);
                          }
                        }}
                        onEnvironmentVariableMapping={(configKey: string, envVarId: string) => {
                          const integration = selectedIntegrations[categoryKey];
                          if (integration) {
                            handleEnvironmentVariableMapping(integration.id, configKey, envVarId);
                          }
                        }}
                        environmentVariableMappings={
                          configuredIntegrations[selectedIntegrations[categoryKey]?.id || ""]
                            ?.environmentVariableMappings || {}
                        }
                      />
                    );
                  })()}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setCategoryChange(
                      categoryChange.includes(category.key)
                        ? categoryChange.filter((c) => c !== category.key)
                        : [...categoryChange, category.key],
                    )
                  }
                >
                  {categoryChange.includes(category.key) ? (
                    <CheckIcon className="size-3.5 text-primary" />
                  ) : (
                    <PenIcon className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        <div className="flex justify-end gap-1 border-t pt-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={handleIntegrationCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleFinalConfirm}
            disabled={
              Object.values(selectedIntegrations).some(
                (integration) => integration && !isConfigured(integration.category.key),
              ) ||
              Object.values(selectedIntegrations).every((integration) => !integration) ||
              isSubmitting ||
              categoryChange.length !== 0
            }
          >
            {isSubmitting && <LoaderIcon className="size-3 animate-spin" />}
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
};

export const ConfigureIntegrationsPrompt = memo(
  PureConfigureIntegrationsPrompt,
  (prevProps, nextProps) => {
    if (
      !fastDeepEqual(prevProps.message, nextProps.message) ||
      !fastDeepEqual(prevProps.environmentVariables, nextProps.environmentVariables)
    ) {
      return false;
    }
    return true;
  },
);
