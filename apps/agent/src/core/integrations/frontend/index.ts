import { defineIntegrationCategory } from "../utils/define-integration-category";
import { tanstackStartIntegration } from "./tanstack-start";

export const frontendIntegrationCategory = defineIntegrationCategory<["tanstack-start"]>({
  key: "frontend",
  description: "Client-side framework for building user interfaces and web applications",
  dependencies: null,
  recommendedIntegrations: ["tanstack-start"],
  priority: 1,
  integrations: {
    "tanstack-start": tanstackStartIntegration,
  },
});
