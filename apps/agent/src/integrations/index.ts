// Export main registry and types
export { integrationRegistry } from "@/integrations/utils/registry";
export type {
  IntegrationCallback,
  IntegrationCallbackResult,
  IntegrationDefinition,
} from "./types";
// Export utilities
export { combineResults } from "./utils/combine-results";
export { installPackages, runBunScript } from "./utils/packages";
export { writeEnvironmentVariables } from "./utils/write-env";
