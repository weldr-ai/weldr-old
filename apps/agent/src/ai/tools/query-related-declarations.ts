import { z } from "zod";

import { and, db, eq } from "@weldr/db";
import { declarations, dependencies, versionDeclarations, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { formatDeclarationData, formatDeclarationSpecs } from "@/ai/utils/formatters";
import { createTool } from "./utils";

export const queryRelatedDeclarationsTool = createTool({
  name: "query_related_declarations",
  description: `Queries the dependencies and/or dependents of a specific declaration using its ID. Returns formatted results showing what the declaration depends on and/or what depends on it.

When you need to understand the relationships between declarations - what a specific declaration depends on (dependencies) or what other declarations use it (dependents).`,
  inputSchema: z.object({
    declarationId: z.string().describe("The ID of the declaration to query relationships for."),
    queryType: z
      .enum(["dependencies", "dependents", "both"])
      .describe(
        "Whether to return dependencies (what this declaration depends on), dependents (what depends on this declaration), or both.",
      )
      .default("both"),
  }),
  outputSchema: z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true),
      formattedResults: z.string(),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
  execute: async ({ input, context }) => {
    const { declarationId, queryType } = input;
    const project = context.project;
    const user = context.user;
    const branch = context.branch;

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
      userId: user.id,
      input,
    });

    logger.info(`Querying related declarations for: "${declarationId}"`);

    try {
      // First, verify the declaration exists and belongs to the project
      const targetDeclaration = await db
        .select()
        .from(declarations)
        .where(eq(declarations.id, declarationId) && eq(declarations.projectId, project.id))
        .limit(1);

      if (targetDeclaration.length === 0) {
        logger.error("Declaration not found or doesn't belong to project");
        return {
          success: false as const,
          error: "Declaration not found or doesn't belong to the current project",
        };
      }

      const targetData = targetDeclaration[0];
      const targetDataObj = targetData?.metadata?.codeMetadata ?? null;
      const targetName = targetDataObj?.name || declarationId;
      let formattedResults = "";

      // Query dependencies (what this declaration depends on)
      if (queryType === "dependencies" || queryType === "both") {
        logger.info("Querying dependencies");

        const dependencyRows = await db
          .select({
            declaration: declarations,
          })
          .from(dependencies)
          .innerJoin(declarations, eq(dependencies.dependencyId, declarations.id))
          .innerJoin(versionDeclarations, eq(versionDeclarations.declarationId, declarations.id))
          .innerJoin(versions, eq(versions.id, versionDeclarations.versionId))
          .where(
            and(
              eq(dependencies.dependentId, declarationId),
              eq(versions.id, branch.headVersion.id),
            ),
          );

        if (dependencyRows.length > 0) {
          formattedResults += `# Dependencies (What "${targetName}" depends on)\n\n`;

          const dependencyResults = dependencyRows
            .map((row) => {
              // Try specs formatter first
              const specsResult = formatDeclarationSpecs(row.declaration);
              if (specsResult) {
                return specsResult;
              }
              // Fall back to data formatter
              return formatDeclarationData(row.declaration);
            })
            .join("\n---\n\n");

          formattedResults += dependencyResults;

          if (queryType === "both") {
            formattedResults += "\n\n";
          }
        } else {
          formattedResults += `# Dependencies\n\nNo dependencies found for "${targetName}"\n\n`;
          if (queryType === "both") {
            formattedResults += "\n";
          }
        }
      }

      // Query dependents (what depends on this declaration)
      if (queryType === "dependents" || queryType === "both") {
        logger.info("Querying dependents");

        const dependentRows = await db
          .select({
            declaration: declarations,
          })
          .from(dependencies)
          .innerJoin(declarations, eq(dependencies.dependentId, declarations.id))
          .innerJoin(versionDeclarations, eq(versionDeclarations.declarationId, declarations.id))
          .innerJoin(versions, eq(versions.id, versionDeclarations.versionId))
          .where(
            and(
              eq(dependencies.dependencyId, declarationId),
              eq(versions.id, branch.headVersion.id),
            ),
          );

        if (dependentRows.length > 0) {
          formattedResults += `# Dependents (What depends on "${targetName}")\n\n`;

          const dependentResults = dependentRows
            .map((row) => {
              // Try specs formatter first
              const specsResult = formatDeclarationSpecs(row.declaration);
              if (specsResult) {
                return specsResult;
              }
              // Fall back to data formatter
              return formatDeclarationData(row.declaration);
            })
            .join("\n---\n\n");

          formattedResults += dependentResults;
        } else {
          formattedResults += `# Dependents\n\nNo dependents found for "${targetName}"`;
        }
      }

      // If no results at all
      if (!formattedResults.trim()) {
        formattedResults = `No related declarations found for ${targetName}`;
      }

      logger.info("Query completed successfully");

      return {
        success: true as const,
        formattedResults,
      };
    } catch (error) {
      logger.error("Error during related declarations query", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Unknown error occurred during query",
      };
    }
  },
});
