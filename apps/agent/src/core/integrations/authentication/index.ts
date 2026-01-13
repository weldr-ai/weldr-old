import { defineIntegrationCategory } from "../utils/define-integration-category";
import { betterAuthIntegration } from "./better-auth";

export const authenticationIntegrationCategory = defineIntegrationCategory<["better-auth"]>({
  key: "authentication",
  description: "User sign-up, sign-in, session management, and access control",
  dependencies: ["backend", "database"],
  recommendedIntegrations: ["better-auth"],
  priority: 0,
  integrations: {
    "better-auth": betterAuthIntegration,
  },
});
