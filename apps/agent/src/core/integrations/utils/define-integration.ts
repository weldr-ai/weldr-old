import { Logger } from "@weldr/shared/logger";
import type { Integration, IntegrationKey } from "@weldr/shared/types";

import { isLocalMode } from "@/core/utils/mode";
import type { SessionContext } from "@/session";
import type { ExtractOptionsForKey, IntegrationDefinition } from "../types";
import { combineResults } from "./combine-results";
import { seedDeclarationTemplates } from "./declaration-templates-utils";
import { installPackages, updatePackageJsonScripts } from "./packages";
import { writeEnvironmentVariables } from "./write-env";

export function defineIntegration<K extends IntegrationKey>(
  props: IntegrationDefinition<K>,
): IntegrationDefinition<K> {
  return {
    ...props,
    postInstall: async ({
      context,
      integration,
    }: {
      context: SessionContext;
      integration: Integration;
    }) => {
      try {
        const project = context.project;
        const branch = context.branch;

        const options = integration?.options as ExtractOptionsForKey<K> | undefined;

        const packages = (await props.packages?.(context, options)) ?? [];
        const scripts = (await props.scripts?.(context, options)) ?? [];

        // In local mode, write environment variables to .env files
        if (isLocalMode()) {
          await writeEnvironmentVariables({
            context,
            integration,
          });
        }

        const results = await Promise.all([
          updatePackageJsonScripts(scripts, branch.id),
          installPackages(packages, branch.id, project.id),
          seedDeclarationTemplates({
            integration,
            context,
          }),
          props.postInstall?.({ context, integration }),
        ]);

        context.project = {
          ...project,
          integrationCategories: new Set([...project.integrationCategories, props.category]),
        };

        return combineResults(results.filter((r) => r !== undefined));
      } catch (error: unknown) {
        Logger.error("Failed to run postInstall hook", {
          error,
        });

        return {
          success: false,
          message: "Failed to run postInstall hook",
        };
      }
    },
  } as unknown as IntegrationDefinition<K>;
}
