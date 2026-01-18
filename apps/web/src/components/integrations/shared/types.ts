import type { ToolResultPart } from "ai";

import type { RouterOutputs } from "@weldr/api";
import type {
  ChatMessage,
  IntegrationCategoryKey,
  IntegrationInstallationStatus,
  IntegrationKey,
} from "@weldr/shared/types";

export type IntegrationTemplate = RouterOutputs["integrationTemplates"]["list"][0];

export interface IntegrationConfiguration {
  templateId: string;
  name?: string;
  environmentVariableMappings: {
    envVarId: string;
    configKey: string;
  }[];
}

export interface SelectedIntegration {
  template: IntegrationTemplate;
  name?: string;
  environmentVariableMappings: Record<string, string>;
}

export type IntegrationToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: {
    categories: IntegrationCategoryKey[];
  };
};

export type IntegrationToolOutput = {
  type: "json";
  value: {
    status: "awaiting_config" | "installing" | "completed" | "cancelled" | "failed";
    categories: IntegrationCategoryKey[];
    integrations?: {
      category: IntegrationCategoryKey;
      key: IntegrationKey;
      name: string;
      status: IntegrationInstallationStatus;
    }[];
  };
};

export type IntegrationToolResultPart = ToolResultPart & {
  output: IntegrationToolOutput;
};

export type IntegrationToolMessage = ChatMessage & {
  id: string;
  role: "tool";
  content: Array<IntegrationToolResultPart>;
};

export interface IntegrationConfigurationProps {
  projectId: string;
  integrationTemplate: IntegrationTemplate;
  environmentVariables: RouterOutputs["environmentVariables"]["list"];
  environmentVariableMappings: Record<string, string>;
  onEnvironmentVariableMapping: (configKey: string, envVarId: string) => void;
  name?: string;
  onNameChange?: (name: string) => void;
  showNameField?: boolean;
}
