import { defineIntegrationCategory } from "../utils/define-integration-category";
import { postgresqlIntegration } from "./postgresql";

export const databaseIntegrationCategory = defineIntegrationCategory<["postgresql"]>({
  key: "database",
  description: "Store and query your application data with relational or NoSQL databases",
  dependencies: ["backend"],
  recommendedIntegrations: ["postgresql"],
  priority: 100,
  integrations: {
    postgresql: postgresqlIntegration,
  },
});
