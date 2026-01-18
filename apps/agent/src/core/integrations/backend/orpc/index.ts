import type { IntegrationPackageSets } from "../../types";
import { defineIntegration } from "../../utils/define-integration";

export const orpcIntegration = defineIntegration<"orpc">({
  category: "backend",
  key: "orpc",
  name: "oRPC",
  description:
    "End-to-end type-safe API framework with built-in OpenAPI support for building robust, contract-first APIs.",
  version: "1.0.0",
  allowMultiple: false,
  variables: null,
  options: null,
  recommendedOptions: null,
  isRecommended: true,
  packages: async (context) => {
    const project = context.project;
    const hasFrontend = project.integrationCategories.has("frontend");

    const packages: IntegrationPackageSets = [
      {
        target: "server",
        runtime: {
          "@orpc/json-schema": "^1.8.2",
          "@orpc/openapi": "^1.8.2",
          "@orpc/server": "^1.8.2",
          "@orpc/zod": "^1.8.2",
          nanoid: "^5.1.5",
          pino: "^9.7.0",
          "pino-http": "^10.5.0",
          zod: "^4.0.5",
        },
        development: {
          "@types/node": "^24.0.14",
          "pino-pretty": "^13.0.0",
          tsdown: "^0.12.9",
          tsx: "^4.20.3",
        },
      },
    ];

    if (hasFrontend) {
      packages.push({
        target: "web",
        runtime: {
          "@orpc/client": "^1.7.4",
          "@orpc/tanstack-query": "^1.7.4",
        },
        development: {},
      });
    }

    return packages;
  },
});
