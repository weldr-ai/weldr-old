import type { Integration, IntegrationCategoryKey, IntegrationKey } from "@weldr/shared/types";

import type { ChatContext } from "@/ai/agent/types";
import { authenticationIntegrationCategory } from "../authentication";
import { backendIntegrationCategory } from "../backend";
import { databaseIntegrationCategory } from "../database";
import { frontendIntegrationCategory } from "../frontend";
import type { IntegrationCategoryDefinition, IntegrationDefinition } from "../types";
import { applyFiles } from "./apply-files";

class IntegrationRegistry {
  private integrationCategories = new Map<
    IntegrationCategoryKey,
    IntegrationCategoryDefinition<IntegrationKey[]>
  >();

  async registerCategory<K extends IntegrationKey[]>(
    category: IntegrationCategoryDefinition<K>,
  ): Promise<void> {
    // Type assertion needed due to the generic constraint
    this.integrationCategories.set(
      category.key,
      category as IntegrationCategoryDefinition<IntegrationKey[]>,
    );
  }

  listCategories(): IntegrationCategoryDefinition<IntegrationKey[]>[] {
    return Array.from(this.integrationCategories.values());
  }

  getCategory(key: IntegrationCategoryKey): IntegrationCategoryDefinition<IntegrationKey[]> {
    const category = this.integrationCategories.get(key);
    if (!category) {
      throw new Error(`Category ${key} not found`);
    }
    return category;
  }

  getIntegration<K extends IntegrationKey>(key: K): IntegrationDefinition<K> {
    // Find the integration by searching through all categories
    for (const category of this.integrationCategories.values()) {
      const integration = category.integrations[key];
      if (integration) {
        return integration;
      }
    }
    throw new Error(`Integration ${key} not found`);
  }

  getIntegrationCategory(key: IntegrationKey): IntegrationCategoryDefinition<IntegrationKey[]> {
    return this.getCategory(this.getIntegration(key).category);
  }

  async install({
    integration,
    context,
  }: {
    integration: Integration;
    context: ChatContext;
  }): Promise<void> {
    const integrationDefinition = this.getIntegration(integration.key);

    if (!integrationDefinition) {
      throw new Error(`Integration ${integration.key} not found`);
    }

    // Run the pre-install hook
    await integrationDefinition.preInstall?.({ context, integration });

    // Apply the files
    await applyFiles({
      integration,
      context,
      categoryKey: integrationDefinition.category,
    });

    // Run the post-install hook
    await integrationDefinition.postInstall?.({ context, integration });
  }

  getInstallationOrder(integrationKeys: IntegrationKey[]): IntegrationKey[] {
    // First, resolve at the category level
    const requiredCategories = new Set<IntegrationCategoryKey>();
    const visitedCategories = new Set<IntegrationCategoryKey>();
    const categoryOrder: IntegrationCategoryKey[] = [];

    // Get all categories from the requested integrations
    for (const key of integrationKeys) {
      const integrationDefinition = this.getIntegration(key);
      requiredCategories.add(integrationDefinition.category);
    }

    const resolveCategoryDependencies = (categoryKey: IntegrationCategoryKey) => {
      if (visitedCategories.has(categoryKey)) {
        return;
      }

      visitedCategories.add(categoryKey);

      const category = this.getCategory(categoryKey);
      const dependencies = category.dependencies || [];

      // First resolve all category dependencies
      for (const depCategoryKey of dependencies) {
        requiredCategories.add(depCategoryKey);
        resolveCategoryDependencies(depCategoryKey);
      }

      // Add this category to the order if not already present
      if (!categoryOrder.includes(categoryKey)) {
        categoryOrder.push(categoryKey);
      }
    };

    // Resolve dependencies for all required categories
    for (const categoryKey of requiredCategories) {
      resolveCategoryDependencies(categoryKey);
    }

    // Sort categories by installation priority for cases where dependencies don't dictate order
    categoryOrder.sort((a, b) => {
      const categoryA = this.getCategory(a);
      const categoryB = this.getCategory(b);
      const priorityA = categoryA.priority;
      const priorityB = categoryB.priority;
      return priorityA - priorityB;
    });

    // Now order the originally requested integrations based on category order
    const resolved: IntegrationKey[] = [];
    const processedIntegrations = new Set<IntegrationKey>();

    for (const categoryKey of categoryOrder) {
      for (const integrationKey of integrationKeys) {
        if (processedIntegrations.has(integrationKey)) {
          continue;
        }

        const integrationDefinition = this.getIntegration(integrationKey);
        if (integrationDefinition.category === categoryKey) {
          resolved.push(integrationKey);
          processedIntegrations.add(integrationKey);
        }
      }
    }

    return resolved;
  }
}

export const integrationRegistry = new IntegrationRegistry();
integrationRegistry.registerCategory(backendIntegrationCategory);
integrationRegistry.registerCategory(frontendIntegrationCategory);
integrationRegistry.registerCategory(databaseIntegrationCategory);
integrationRegistry.registerCategory(authenticationIntegrationCategory);
