import type {
  Integration,
  IntegrationCategory,
  IntegrationCategoryKey,
  IntegrationKey,
  IntegrationTemplate,
} from "@weldr/shared/types";

import type { ChatContext } from "@/ai/agent/types";

export interface IntegrationCallbackResult {
  success: boolean;
  message?: string;
  installedPackages?: string[];
  createdFiles?: string[];
  errors?: string[];
}

export type FileItem =
  | {
      type: "copy" | "llm_instruction";
      sourcePath: string;
      targetPath: string;
      content: string;
    }
  | {
      type: "handlebars";
      sourcePath: string;
      targetPath: string;
      template: string;
    };

export type IntegrationCallback = (params: {
  context: ChatContext;
  integration: Integration;
}) => Promise<IntegrationCallbackResult>;

export type ExtractOptionsForKey<K extends IntegrationKey> = Extract<
  Integration,
  { key: K }
>["options"];

export type ExtractTemplateForKey<K extends IntegrationKey> = Extract<
  IntegrationTemplate,
  { key: K }
>;

export type IntegrationPackageSets = {
  target: "web" | "server";
  runtime: Record<string, string>;
  development: Record<string, string>;
}[];

export type IntegrationScriptSets = {
  target: "root" | "server" | "web";
  scripts: Record<string, string>;
}[];

interface IntegrationDefinitionExtension<K extends IntegrationKey> {
  category: IntegrationCategoryKey;
  packages?: (
    context: ChatContext,
    options?: ExtractOptionsForKey<K>,
  ) => Promise<IntegrationPackageSets>;
  scripts?: (
    context: ChatContext,
    options?: ExtractOptionsForKey<K>,
  ) => Promise<IntegrationScriptSets>;
  preInstall?: IntegrationCallback;
  postInstall?: IntegrationCallback;
}

// oxlint-disable-next-line no-explicit-any
export type DistributiveOmit<T, K extends keyof T> = T extends any ? Omit<T, K> : never;

export type IntegrationDefinition<K extends IntegrationKey> = DistributiveOmit<
  ExtractTemplateForKey<K>,
  "id" | "createdAt" | "updatedAt"
> &
  IntegrationDefinitionExtension<K>;

export type IntegrationCategoryDefinition<K extends IntegrationKey[]> = DistributiveOmit<
  IntegrationCategory,
  "id"
> & {
  integrations: {
    [key in K[number]]: IntegrationDefinition<key>;
  };
};
