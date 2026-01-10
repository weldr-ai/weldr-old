import { defineIntegrationCategory } from "../utils/define-integration-category";
import { orpcIntegration } from "./orpc";

export const backendIntegrationCategory = defineIntegrationCategory<["orpc"]>({
  key: "backend",
  description: "Server-side API framework for handling business logic and data processing",
  dependencies: null,
  recommendedIntegrations: ["orpc"],
  priority: 100,
  integrations: {
    orpc: orpcIntegration,
  },
});
