import type { JSONSchema7 } from "json-schema";
import type { z } from "zod";

import type { branchSchema } from "../validators/branches";
import type {
  aiMetadataSchema,
  assistantMessageSchema,
  attachmentSchema,
  chatMessageSchema,
  chatSchema,
  messageRoleSchema,
  toolMessageSchema,
  userMessageSchema,
} from "../validators/chats";
import type { environmentVariableSchema } from "../validators/environment-variables";
import type {
  integrationCategoryKeySchema,
  integrationCategorySchema,
} from "../validators/integration-categories";
import type { integrationTemplateSchema } from "../validators/integration-templates";
import type {
  integrationEnvironmentVariableMappingSchema,
  integrationInstallationSchema,
  integrationInstallationStatusSchema,
  integrationKeySchema,
  integrationSchema,
} from "../validators/integrations";
import type { dataTypeSchema } from "../validators/json-schema";
import type { nodeSchema, nodeTypeSchema } from "../validators/nodes";
import type { openApiEndpointSpecSchema } from "../validators/openapi";
import type { packageSchema } from "../validators/packages";
import type { planSchema, taskSchema } from "../validators/plans";
import type { projectSchema } from "../validators/projects";
import type { themeDataSchema, themeSchema } from "../validators/themes";
import type { versionSchema } from "../validators/versions";
import type { DeclarationMetadata, DeclarationProgress } from "./declarations";

export type DataType = z.infer<typeof dataTypeSchema>;

export type OpenApiEndpointSpec = z.infer<typeof openApiEndpointSpecSchema>;
export type JsonSchema = JSONSchema7;

export type Project = z.infer<typeof projectSchema>;
export type Branch = z.infer<typeof branchSchema>;

export type Version = z.infer<typeof versionSchema>;

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageContent = z.infer<typeof chatMessageSchema>["content"];
export type AiMessageMetadata = z.infer<typeof aiMetadataSchema>;
export type UserMessage = z.infer<typeof userMessageSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ToolMessage = z.infer<typeof toolMessageSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type Package = z.infer<typeof packageSchema>;

export type NodeType = z.infer<typeof nodeTypeSchema>;
export type Node = z.infer<typeof nodeSchema>;

export type Theme = z.infer<typeof themeSchema>;
export type ThemeData = z.infer<typeof themeDataSchema>;
export type ThemeMode = keyof Theme;

export type Plan = z.infer<typeof planSchema>;
export type Task = z.infer<typeof taskSchema>;

export type TStatus =
  | "thinking"
  | "responding"
  | "waiting"
  | "planning"
  | "coding"
  | "finalizing"
  | null;

export type TextStreamableValue = {
  id: string;
  type: "text";
  text: string;
};

export type ReasoningStreamableValue = {
  id: string;
  type: "reasoning";
  text: string;
};

export type EndStreamableValue = {
  type: "end";
};

export type NodeStreamableValue = {
  type: "node";
  nodeId: string;
  position: { x: number; y: number };
  metadata: DeclarationMetadata;
  progress: DeclarationProgress;
  node: Node;
};

export type ToolCallStreamableValue = {
  id: string;
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ToolStreamableValue = {
  type: "tool";
  message: ToolMessage;
};

export type ProjectStreamableValue = {
  type: "update_project";
  data: Omit<Project, "environmentVariables">;
};

export type BranchStreamableValue = {
  type: "update_branch";
  data: Branch;
};

export type IntegrationStreamableValue = {
  type: "integration";
  data: {
    id: string;
    key: IntegrationKey;
  };
};

export type SSEConnectionEvent = {
  type: "connected";
  streamId: string;
};

export type SSEErrorEvent = {
  type: "error";
  error: string;
};

export type SSEStatusEvent = {
  type: "status";
  status: TStatus;
};

export type SSEValue =
  | TextStreamableValue
  | ReasoningStreamableValue
  | ToolCallStreamableValue
  | ToolStreamableValue
  | NodeStreamableValue
  | ProjectStreamableValue
  | BranchStreamableValue
  | EndStreamableValue
  | SSEConnectionEvent
  | SSEErrorEvent
  | SSEStatusEvent;

export type SSEEvent = SSEValue & {
  id: string;
};

// Trigger API response type
export type TriggerWorkflowResponse = {
  success: boolean;
  streamId: string;
  runId: string;
  message?: string;
};

export type IntegrationCategory = z.infer<typeof integrationCategorySchema>;
export type IntegrationCategoryKey = z.infer<typeof integrationCategoryKeySchema>;

export type IntegrationTemplateOptions = z.infer<typeof integrationTemplateSchema>["options"];
export type IntegrationTemplateRecommendedOptions = z.infer<
  typeof integrationTemplateSchema
>["recommendedOptions"];
export type IntegrationTemplateVariable = z.infer<typeof integrationTemplateSchema>["variables"];
export type IntegrationTemplate = z.infer<typeof integrationTemplateSchema>;

export type IntegrationKey = z.infer<typeof integrationKeySchema>;
export type IntegrationOptions = z.infer<typeof integrationSchema>["options"];
export type Integration = z.infer<typeof integrationSchema>;
export type IntegrationEnvironmentVariableMapping = z.infer<
  typeof integrationEnvironmentVariableMappingSchema
>;
export type IntegrationInstallationStatus = z.infer<typeof integrationInstallationStatusSchema>;
export type IntegrationInstallation = z.infer<typeof integrationInstallationSchema>;
