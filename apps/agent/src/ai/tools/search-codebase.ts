import { embedMany } from "ai";
import { z } from "zod";

import { and, cosineDistance, db, desc, eq, getTableColumns, gt, isNotNull, sql } from "@weldr/db";
import { declarations, versionDeclarations, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { registry } from "@/ai/providers";
import { formatDeclarationData, formatDeclarationSpecs } from "@/core/project/declarations";
import { createTool } from "./create-tool";

export const searchCodebaseTool = createTool({
  name: "search_codebase",
  description: `Searches for the most relevant declarations in the codebase based on semantic similarity to a query text. Returns formatted results with detailed information including path, position, purpose, parameters, and example usage.

When you need to find declarations (functions, components, models, endpoints) that are semantically similar to a specific query or concept.`,
  inputSchema: z.object({
    query: z.string().describe("The search query to find semantically similar declarations."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .default(5)
      .describe("The maximum number of results to return (default: 5)."),
    minSimilarity: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.1)
      .describe("Minimum similarity threshold (0-1, default: 0.1)."),
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
    const { query, limit, minSimilarity } = input;
    const project = context.project;
    const user = context.user;
    const branch = context.branch;

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
      userId: user.id,
      input,
    });

    logger.info(`Starting codebase search for query: "${query}"`);

    try {
      // Generate embedding for the query
      logger.info("Generating embedding for search query");
      const embeddingModel = registry.embeddingModel("openai:text-embedding-ada-002");

      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: [query],
      });

      if (!embeddings || embeddings.length === 0) {
        logger.error("Failed to generate embedding for query");
        return {
          success: false as const,
          error: "Failed to generate embedding for the search query",
        };
      }

      const queryEmbedding = embeddings[0];
      if (!queryEmbedding) {
        logger.error("Query embedding is undefined");
        return {
          success: false as const,
          error: "Failed to generate valid embedding for the search query",
        };
      }
      logger.info("Query embedding generated successfully");

      // Perform vector similarity search using Drizzle ORM's cosineDistance
      logger.info("Executing vector similarity search with cosineDistance");

      const similarity = sql<number>`1 - (${cosineDistance(declarations.embedding, queryEmbedding)})`;

      const similarDeclarations = await db
        .select({
          ...getTableColumns(declarations),
          similarity,
        })
        .from(declarations)
        .innerJoin(
          versionDeclarations,
          sql`${versionDeclarations.declarationId} = ${declarations.id}`,
        )
        .innerJoin(versions, sql`${versions.id} = ${versionDeclarations.versionId}`)
        .where(
          and(
            eq(declarations.projectId, project.id),
            isNotNull(declarations.embedding),
            gt(similarity, minSimilarity),
            eq(versions.id, branch.headVersion.id),
          ),
        )
        .orderBy(desc(similarity))
        .limit(limit);

      // Format results
      const formattedResults = similarDeclarations
        .map((row) => {
          const similarityScoreText = `**Similarity Score:** ${(row.similarity * 100).toFixed(1)}%`;

          // Try specs formatter first
          const specsResult = formatDeclarationSpecs(row);

          if (specsResult) {
            return `${specsResult}\n\n${similarityScoreText}`;
          }

          // Fall back to data formatter
          return `${formatDeclarationData(row)}\n\n${similarityScoreText}`;
        })
        .join("\n---\n\n");

      logger.info(`Found ${similarDeclarations.length} similar declarations`);

      return {
        success: true as const,
        formattedResults,
      };
    } catch (error) {
      logger.error("Error during codebase search", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Unknown error occurred during search",
      };
    }
  },
});
