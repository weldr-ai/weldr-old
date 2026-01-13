import { readFile } from "node:fs/promises";

import { and, db, eq } from "@weldr/db";
import {
  declarationTemplates,
  integrationCategories,
  integrationTemplates,
} from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { IntegrationCategoryKey, IntegrationKey } from "@weldr/shared/types";
import type { DeclarationMetadata } from "@weldr/shared/types/declarations";

import { embedDeclaration } from "@/core/project/declarations/embed";
import type { IntegrationDefinition } from "../types";
import { integrationRegistry } from "./registry";

const registeredCategories = integrationRegistry.listCategories();
Logger.info(`Found ${registeredCategories.length} registered categories`);

/**
 * Extract source path from the file path where declarations were found
 */
function extractSourceFromPath(
  successPath: string,
  integration: IntegrationDefinition<"postgresql">,
): string | null {
  // Parse the path: apps/agent/src/integrations/{category}/{key}/{option}/data/declarations.json
  const pathParts = successPath.split("/");
  const integrationIndex = pathParts.findIndex((part) => part === integration.key);

  if (integrationIndex === -1) {
    return null;
  }

  const nextPart = pathParts[integrationIndex + 1];

  // If the next part is "data", then there's no option subdirectory
  if (nextPart === "data") {
    return `${integration.key}`;
  }

  // Otherwise, include the option in the source path
  return `${integration.key}/${nextPart}`;
}

async function insertCategories(categoryKeys?: IntegrationCategoryKey[]): Promise<void> {
  const categoriesToInsert = categoryKeys
    ? registeredCategories.filter((c) => categoryKeys.includes(c.key))
    : registeredCategories;

  Logger.info(`📁 Inserting ${categoriesToInsert.length} integration categories...`);

  try {
    await db.transaction(async (tx) => {
      for (const category of categoriesToInsert) {
        const [insertCategory] = await tx
          .insert(integrationCategories)
          .values({
            key: category.key,
            description: category.description,
            recommendedIntegrations: category.recommendedIntegrations,
            priority: category.priority,
            dependencies: category.dependencies,
          })
          .onConflictDoNothing()
          .returning({
            id: integrationCategories.id,
            key: integrationCategories.key,
          });

        if (insertCategory) {
          Logger.info(`  ✅ Inserted category: ${insertCategory.key}`);
        }
      }
    });
    Logger.info("📁 Categories insertion completed");
  } catch (error) {
    Logger.error("❌ Error inserting categories", {
      error,
    });
    throw error;
  }
}

async function updateCategories(categoryKeys?: IntegrationCategoryKey[]): Promise<void> {
  const categoriesToUpdate = categoryKeys
    ? registeredCategories.filter((c) => categoryKeys.includes(c.key))
    : registeredCategories;

  Logger.info(`📁 Updating ${categoriesToUpdate.length} integration categories...`);

  try {
    await db.transaction(async (tx) => {
      for (const category of categoriesToUpdate) {
        const [updated] = await tx
          .update(integrationCategories)
          .set({
            description: category.description,
            recommendedIntegrations: category.recommendedIntegrations,
            priority: category.priority,
            dependencies: category.dependencies,
          })
          .where(eq(integrationCategories.key, category.key))
          .returning({
            id: integrationCategories.id,
            key: integrationCategories.key,
          });

        if (updated) {
          Logger.info(`  ✅ Updated category: ${updated.key}`);
        }
      }
    });
    Logger.info("📁 Categories update completed");
  } catch (error) {
    Logger.error("❌ Error updating categories", {
      error,
    });
    throw error;
  }
}

async function insertIntegrationTemplates(categoryKeys?: IntegrationCategoryKey[]): Promise<void> {
  const categoriesToProcess = categoryKeys
    ? registeredCategories.filter((c) => categoryKeys.includes(c.key))
    : registeredCategories;

  Logger.info(`🔧 Inserting integration templates for ${categoriesToProcess.length} categories...`);

  try {
    await db.transaction(async (tx) => {
      for (const category of categoriesToProcess) {
        const [existingCategory] = await tx
          .select()
          .from(integrationCategories)
          .where(eq(integrationCategories.key, category.key))
          .limit(1);

        if (!existingCategory) {
          Logger.warn(`⚠️  Category ${category.key} not found. Skipping integrations.`);
          continue;
        }

        for (const integration of Object.values(category.integrations)) {
          const templateData = {
            name: integration.name,
            description: integration.description,
            categoryId: existingCategory.id,
            key: integration.key as IntegrationKey,
            version: integration.version,
            variables: integration.variables,
            options: integration.options,
            allowMultiple: integration.allowMultiple,
            recommendedOptions: integration.recommendedOptions,
            isRecommended: integration.isRecommended,
          };

          const [result] = await tx
            .insert(integrationTemplates)
            .values(templateData)
            .onConflictDoNothing()
            .returning({
              id: integrationTemplates.id,
              key: integrationTemplates.key,
              version: integrationTemplates.version,
            });

          if (result) {
            Logger.info(`  ✅ Inserted template: ${integration.key} v${integration.version}`);
          }
        }
      }
    });
    Logger.info("🔧 Integration templates insertion completed");
  } catch (error) {
    Logger.error("❌ Error inserting integration templates", {
      error,
    });
    throw error;
  }
}

async function insertDeclarationTemplates(
  categoryKeys?: IntegrationCategoryKey[],
  integrationKeys?: IntegrationKey[],
): Promise<void> {
  const categoriesToProcess = categoryKeys
    ? registeredCategories.filter((c) => categoryKeys.includes(c.key))
    : registeredCategories;

  Logger.info("📄 Inserting declaration templates...");
  if (categoryKeys) {
    Logger.info(`  Filtering by categories: ${categoryKeys.join(", ")}`);
  }
  if (integrationKeys) {
    Logger.info(`  Filtering by integrations: ${integrationKeys.join(", ")}`);
  }

  try {
    await db.transaction(async (tx) => {
      for (const category of categoriesToProcess) {
        const integrationsToProcess = integrationKeys
          ? Object.values(category.integrations).filter((i) =>
              integrationKeys.includes(i.key as IntegrationKey),
            )
          : Object.values(category.integrations);

        for (const integration of integrationsToProcess) {
          const [existingTemplate] = await tx
            .select()
            .from(integrationTemplates)
            .where(
              and(
                eq(integrationTemplates.key, integration.key as IntegrationKey),
                eq(integrationTemplates.version, integration.version),
              ),
            )
            .limit(1);

          if (!existingTemplate) {
            Logger.warn(
              `⚠️  Integration template ${integration.key} v${integration.version} not found. Skipping declarations.`,
            );
            continue;
          }

          // Try to find declarations - first check if there are ORM options
          const possiblePaths: string[] = [];

          // If integration has ORM options, check each subdirectory
          if (
            (integration as IntegrationDefinition<"postgresql">).options?.orm &&
            Array.isArray((integration as IntegrationDefinition<"postgresql">).options.orm)
          ) {
            for (const orm of (integration as IntegrationDefinition<"postgresql">).options.orm) {
              possiblePaths.push(
                `apps/agent/src/integrations/${integration.category}/${integration.key}/${orm}/data/declarations.json`,
              );
            }
          }

          // Also check the default path (for integrations without options)
          possiblePaths.push(
            `apps/agent/src/integrations/${integration.category}/${integration.key}/data/declarations.json`,
          );

          let fileContent: string | null = null;
          let successPath: string | null = null;

          // Try each possible path
          for (const path of possiblePaths) {
            try {
              fileContent = await readFile(path, "utf-8");
              successPath = path;
              Logger.info(`    📖 Found declarations at: ${path}`);
              break;
            } catch {
              // Continue to next path
            }
          }

          if (!fileContent || !successPath) {
            Logger.warn(
              `⚠️  No declarations found for ${integration.key} in any of: ${possiblePaths.join(", ")}`,
            );
            continue;
          }

          // Extract source path from the successful path
          const sourcePath = extractSourceFromPath(
            successPath,
            integration as IntegrationDefinition<"postgresql">,
          );

          if (sourcePath) {
            Logger.info(`    📍 Source path: ${sourcePath}`);
          }

          try {
            const declarationsData = JSON.parse(fileContent) as Record<
              string,
              Array<{
                codeMetadata: DeclarationMetadata["codeMetadata"];
                semanticData: DeclarationMetadata["semanticData"];
              }>
            >;

            for (const [filePath, fileDeclarations] of Object.entries(declarationsData)) {
              for (const declaration of fileDeclarations) {
                // Check if declaration already exists to avoid generating embedding
                const [existing] = await tx
                  .select({ id: declarationTemplates.id })
                  .from(declarationTemplates)
                  .where(eq(declarationTemplates.uri, declaration.codeMetadata?.uri || ""))
                  .limit(1);

                if (existing) {
                  Logger.info(
                    `    ⏩ Skipped existing declaration: ${filePath} (${declaration.codeMetadata?.uri})`,
                  );
                  continue;
                }

                const metadata: DeclarationMetadata = {
                  version: "v1",
                  codeMetadata: declaration.codeMetadata,
                  semanticData: declaration.semanticData,
                };

                const embedding = await embedDeclaration(metadata);

                const [result] = await tx
                  .insert(declarationTemplates)
                  .values({
                    id: nanoid(),
                    version: "v1",
                    uri: declaration.codeMetadata?.uri,
                    path: filePath,
                    metadata,
                    embedding,
                    source: sourcePath,
                    integrationTemplateId: existingTemplate.id,
                  })
                  .returning({
                    id: declarationTemplates.id,
                    path: declarationTemplates.path,
                    uri: declarationTemplates.uri,
                  });

                if (result) {
                  Logger.info(`    ✅ Inserted declaration: ${result.path} (${result.uri})`);
                }
              }
            }
          } catch (fileError) {
            Logger.warn(
              `⚠️  Could not read declarations file for ${integration.key}: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
            );
          }
        }
      }
    });
    Logger.info("📄 Declaration templates insertion completed");
  } catch (error) {
    Logger.error("❌ Error inserting declaration templates", {
      error,
    });
    throw error;
  }
}

async function updateDeclarationTemplates(integrationKeys?: IntegrationKey[]): Promise<void> {
  Logger.info("📄 Updating declaration templates...");

  try {
    await db.transaction(async (tx) => {
      for (const category of registeredCategories) {
        const integrationsToUpdate = integrationKeys
          ? Object.values(category.integrations).filter((i) =>
              integrationKeys.includes(i.key as IntegrationKey),
            )
          : Object.values(category.integrations);

        for (const integration of integrationsToUpdate) {
          const [existingTemplate] = await tx
            .select()
            .from(integrationTemplates)
            .where(
              and(
                eq(integrationTemplates.key, integration.key as IntegrationKey),
                eq(integrationTemplates.version, integration.version),
              ),
            )
            .limit(1);

          if (!existingTemplate) {
            Logger.warn(
              `⚠️  Integration template ${integration.key} v${integration.version} not found. Skipping declarations.`,
            );
            continue;
          }

          await tx
            .delete(declarationTemplates)
            .where(eq(declarationTemplates.integrationTemplateId, existingTemplate.id));

          // Try to find declarations - first check if there are ORM options
          const possiblePaths: string[] = [];

          // If integration has ORM options, check each subdirectory
          if (
            (integration as IntegrationDefinition<"postgresql">).options?.orm &&
            Array.isArray((integration as IntegrationDefinition<"postgresql">).options.orm)
          ) {
            for (const orm of (integration as IntegrationDefinition<"postgresql">).options.orm) {
              possiblePaths.push(
                `apps/agent/src/integrations/${integration.category}/${integration.key}/${orm}/data/declarations.json`,
              );
            }
          }

          // Also check the default path (for integrations without options)
          possiblePaths.push(
            `apps/agent/src/integrations/${integration.category}/${integration.key}/data/declarations.json`,
          );

          let fileContent: string | null = null;
          let successPath: string | null = null;

          // Try each possible path
          for (const path of possiblePaths) {
            try {
              fileContent = await readFile(path, "utf-8");
              successPath = path;
              Logger.info(`    📖 Found declarations at: ${path}`);
              break;
            } catch {
              // Continue to next path
            }
          }

          if (!fileContent || !successPath) {
            Logger.warn(
              `⚠️  No declarations found for ${integration.key} in any of: ${possiblePaths.join(", ")}`,
            );
            continue;
          }

          // Extract source path from the successful path
          const sourcePath = extractSourceFromPath(
            successPath,
            integration as IntegrationDefinition<"postgresql">,
          );

          if (sourcePath) {
            Logger.info(`    📍 Source path: ${sourcePath}`);
          }

          try {
            const declarationsData = JSON.parse(fileContent) as Record<
              string,
              Array<{
                codeMetadata: DeclarationMetadata["codeMetadata"];
                semanticData: DeclarationMetadata["semanticData"];
              }>
            >;

            for (const [filePath, fileDeclarations] of Object.entries(declarationsData)) {
              for (const declaration of fileDeclarations) {
                const metadata: DeclarationMetadata = {
                  version: "v1",
                  codeMetadata: declaration.codeMetadata,
                  semanticData: declaration.semanticData,
                };

                const embedding = await embedDeclaration(metadata);

                const [result] = await tx
                  .insert(declarationTemplates)
                  .values({
                    id: nanoid(),
                    version: "v1",
                    uri: declaration.codeMetadata?.uri,
                    path: filePath,
                    metadata,
                    embedding,
                    source: sourcePath,
                    integrationTemplateId: existingTemplate.id,
                  })
                  .returning({
                    id: declarationTemplates.id,
                    path: declarationTemplates.path,
                    uri: declarationTemplates.uri,
                  });

                if (result) {
                  Logger.info(`    ✅ Updated declaration: ${result.path} (${result.uri})`);
                }
              }
            }
          } catch (fileError) {
            Logger.warn(
              `⚠️  Could not read declarations file for ${integration.key}: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
            );
          }
        }
      }
    });
    Logger.info("📄 Declaration templates update completed");
  } catch (error) {
    Logger.error("❌ Error updating declaration templates", {
      error,
    });
    throw error;
  }
}

async function updateIntegrationTemplates(categoryKeys?: IntegrationCategoryKey[]): Promise<void> {
  const categoriesToUpdate = categoryKeys
    ? registeredCategories.filter((c) => categoryKeys.includes(c.key))
    : registeredCategories;

  Logger.info(`🔧 Updating integration templates for ${categoriesToUpdate.length} categories...`);

  try {
    await db.transaction(async (tx) => {
      for (const category of categoriesToUpdate) {
        const [existingCategory] = await tx
          .select()
          .from(integrationCategories)
          .where(eq(integrationCategories.key, category.key))
          .limit(1);

        if (!existingCategory) {
          Logger.warn(`⚠️  Category ${category.key} not found. Skipping integrations.`);
          continue;
        }

        for (const integration of Object.values(category.integrations)) {
          const templateData = {
            name: integration.name,
            description: integration.description,
            categoryId: existingCategory.id,
            variables: integration.variables,
            options: integration.options,
            allowMultiple: integration.allowMultiple,
            recommendedOptions: integration.recommendedOptions,
            isRecommended: integration.isRecommended,
          };

          const [result] = await tx
            .update(integrationTemplates)
            .set(templateData)
            .where(
              and(
                eq(integrationTemplates.key, integration.key as IntegrationKey),
                eq(integrationTemplates.version, integration.version),
              ),
            )
            .returning({
              id: integrationTemplates.id,
              key: integrationTemplates.key,
              version: integrationTemplates.version,
            });

          if (result) {
            Logger.info(`  ✅ Updated template: ${integration.key} v${integration.version}`);
          }
        }
      }
    });
    Logger.info("🔧 Integration templates update completed");
  } catch (error) {
    Logger.error("❌ Error updating integration templates", {
      error,
    });
    throw error;
  }
}

/**
 * Parse command line arguments to extract categories or integration keys
 */
function parseArgs(args: string[]): {
  command: string;
  categories?: IntegrationCategoryKey[];
  integrations?: IntegrationKey[];
} {
  const command = args[0] || "seed-all";
  const result: {
    command: string;
    categories?: IntegrationCategoryKey[];
    integrations?: IntegrationKey[];
  } = { command };

  // Parse --categories or -c flag
  const categoryIndex = args.findIndex((arg) => arg === "--categories" || arg === "-c");
  if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    const categoryArg = args[categoryIndex + 1];
    if (categoryArg) {
      result.categories = categoryArg.split(",").map((c) => c.trim()) as IntegrationCategoryKey[];
    }
  }

  // Parse --integrations or -i flag
  const integrationIndex = args.findIndex((arg) => arg === "--integrations" || arg === "-i");
  if (integrationIndex !== -1 && args[integrationIndex + 1]) {
    const integrationArg = args[integrationIndex + 1];
    if (integrationArg) {
      result.integrations = integrationArg.split(",").map((i) => i.trim()) as IntegrationKey[];
    }
  }

  return result;
}

/**
 * Run seed script directly if called
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    Logger.info(`
📚 Weldr Integration Seed Script

Usage: bun seed [command] [options]

Commands:
  insert-categories               Insert new integration categories
  update-categories               Update existing integration categories
  insert-integration-templates    Insert new integration templates
  update-integration-templates    Update existing integration templates
  insert-declaration-templates    Insert new declaration templates
  update-declaration-templates    Update existing declaration templates
  seed-all                        Run all insert operations (default)

Options:
  -c, --categories <list>         Comma-separated list of category keys to process
  -i, --integrations <list>       Comma-separated list of integration keys to process
  -h, --help                      Show this help message

Examples:
  bun seed.ts insert-categories -c "auth,database"
  bun seed.ts update-integration-templates -c "auth"
  bun seed.ts update-declaration-templates -i "better-auth,postgresql"
  bun seed.ts seed-all
    `);
    process.exit(0);
  }

  const { command, categories, integrations } = parseArgs(args);

  // Log what we're about to do
  if (categories) {
    Logger.info(`🎯 Processing categories: ${categories.join(", ")}`);
  }
  if (integrations) {
    Logger.info(`🎯 Processing integrations: ${integrations.join(", ")}`);
  }

  try {
    const commands = {
      "insert-categories": insertCategories,
      "update-categories": updateCategories,
      "insert-integration-templates": insertIntegrationTemplates,
      "update-integration-templates": updateIntegrationTemplates,
      "insert-declaration-templates": insertDeclarationTemplates,
      "update-declaration-templates": updateDeclarationTemplates,
      "seed-all": async (
        categories?: IntegrationCategoryKey[],
        integrations?: IntegrationKey[],
      ) => {
        await insertCategories(categories);
        await insertIntegrationTemplates(categories);
        await insertDeclarationTemplates(categories, integrations);
      },
    };

    switch (command) {
      case "insert-categories": {
        await commands["insert-categories"](categories);
        break;
      }
      case "update-categories": {
        await commands["update-categories"](categories);
        break;
      }
      case "insert-integration-templates": {
        await commands["insert-integration-templates"](categories);
        break;
      }
      case "update-integration-templates": {
        await commands["update-integration-templates"](categories);
        break;
      }
      case "insert-declaration-templates": {
        await commands["insert-declaration-templates"](categories, integrations);
        break;
      }
      case "update-declaration-templates": {
        await commands["update-declaration-templates"](integrations);
        break;
      }
      case "seed-all": {
        await commands["seed-all"](categories, integrations);
        break;
      }
      default: {
        Logger.error(
          `Unknown command: ${command} (available: ${Object.keys(commands).join(", ")})`,
        );
        process.exit(1);
      }
    }

    Logger.info("✅ Operation completed successfully");
    process.exit(0);
  } catch (error) {
    Logger.error("❌ Operation failed", {
      error,
    });
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch((error) => {
    Logger.error("❌ Error running operation:", error);
    process.exit(1);
  });
}
