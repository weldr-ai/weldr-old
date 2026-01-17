import { inArray } from "drizzle-orm";

import { and, db, eq } from "@weldr/db";
import { declarations, dependencies, snapshotDeclarations } from "@weldr/db/schema";
import { mergeJson } from "@weldr/db/utils";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { extractDeclarations } from "@/core/project/declarations/extractor";
import type { ExecutionContext } from "@/session";
import { queueEnrichingJob } from "./enriching-jobs";

/**
 * Generates TypeScript path aliases based on the project's integration categories.
 *
 * Path aliases are used to resolve import paths during declaration extraction:
 * - Both frontend + backend: Creates aliases for both `@repo/web/*` and `@repo/server/*`
 * - Backend only: Creates alias for `@repo/server/*`
 * - Frontend only: Creates alias for `@repo/web/*`
 *
 * @param integrationCategories - Set of integration category strings (e.g., "frontend", "backend")
 * @returns Record mapping path alias patterns to their actual file system paths
 */
function getPathAliases(integrationCategories: Set<string>): Record<string, string> {
  const pathAliases: Record<string, string> = {};

  if (integrationCategories.has("frontend") && integrationCategories.has("backend")) {
    pathAliases["@repo/web/*"] = "apps/web/src/*";
    pathAliases["@repo/server/*"] = "apps/server/src/*";
  } else if (integrationCategories.has("backend")) {
    pathAliases["@repo/server/*"] = "apps/server/src/*";
  } else if (integrationCategories.has("frontend")) {
    pathAliases["@repo/web/*"] = "apps/web/src/*";
  }

  return pathAliases;
}

/**
 * Fetches all declarations associated with a specific snapshot.
 *
 * Retrieves the snapshot-declaration links and joins with declaration data including:
 * - Declaration ID, file path, URI
 * - Progress status
 * - Metadata (specs, code metadata)
 *
 * @param tx - Database transaction object
 * @param snapshotId - ID of the snapshot to fetch declarations for
 * @returns Array of snapshot-declaration links with their associated declaration data
 */
async function getSnapshotDeclarations(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  snapshotId: string,
) {
  return await tx.query.snapshotDeclarations.findMany({
    where: and(eq(snapshotDeclarations.snapshotId, snapshotId)),
    with: {
      declaration: {
        columns: {
          id: true,
          path: true,
          uri: true,
          progress: true,
          metadata: true,
        },
      },
    },
  });
}

type DeclarationOperation = { type: "update"; declarationId: string } | { type: "create" };

/**
 * Determines what operation should be performed for an extracted declaration.
 *
 * The function follows this decision tree:
 * 1. **Update**: If a declaration with the same URI already exists
 * 2. **Create**: If no URI match exists, create a new declaration
 *
 * @param extractedDeclaration - The declaration extracted from source code
 * @param snapshotDeclarations - All declarations currently in the snapshot
 * @param existingDeclarationByUri - Result of direct URI lookup in declarations table
 * @param logger - Logger instance for tracking decision process
 * @returns Operation object indicating whether to update or create, along with relevant declaration ID
 */
function determineDeclarationOperation(
  extractedDeclaration: DeclarationCodeMetadata,
  snapshotDeclarationsList: Array<
    NonNullable<Awaited<ReturnType<typeof getSnapshotDeclarations>>[number]["declaration"]>
  >,
  existingDeclarationByUri: { id: string } | null | undefined,
  logger: ReturnType<typeof Logger.get>,
): DeclarationOperation {
  const doesDeclarationExist = snapshotDeclarationsList.find(
    (d) => extractedDeclaration.uri === d.uri,
  );

  if (doesDeclarationExist || existingDeclarationByUri) {
    const existingId = doesDeclarationExist?.id || existingDeclarationByUri?.id;
    if (!existingId) {
      throw new Error(
        `Expected existing declaration ID but got none for URI: ${extractedDeclaration.uri}`,
      );
    }
    logger.info(`Decision: UPDATE existing declaration ${existingId} (matched by URI)`);
    return {
      type: "update",
      declarationId: existingId,
    };
  }

  logger.info(`Decision: CREATE new declaration for ${extractedDeclaration.uri} (no match found)`);
  return {
    type: "create",
  };
}

/**
 * Resolves and creates dependency relationships between declarations.
 *
 * Iterates through all extracted declarations and processes their dependencies:
 * - Maps dependency URIs to declaration IDs using the newly created declarations map
 * - Falls back to searching head version declarations if not found in the new map
 * - Creates dependency records in the database linking dependents to their dependencies
 * - Only processes internal dependencies (not external package dependencies)
 *
 * Dependencies are stored in a many-to-many relationship table, allowing:
 * - Tracking which declarations depend on others
 * - Building dependency graphs for impact analysis
 * - Understanding code relationships and coupling
 *
 * @param tx - Database transaction object
 * @param extractedDeclarations - Array of declarations extracted from source code with their dependency information
 * @param declarationUriToIdMap - Map of declaration URIs to their database IDs (for newly created/updated declarations)
 * @param snapshotDeclarations - All declarations currently in the snapshot (for fallback lookup)
 * @param logger - Logger instance for tracking dependency resolution
 */
async function resolveDependencies(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  extractedDeclarations: DeclarationCodeMetadata[],
  declarationUriToIdMap: Map<string, string>,
  snapshotDeclarationsList: Awaited<ReturnType<typeof getSnapshotDeclarations>>,
  logger: ReturnType<typeof Logger.get>,
): Promise<void> {
  for (const data of extractedDeclarations) {
    const dependentUri = data.uri;
    const dependentId = declarationUriToIdMap.get(dependentUri);

    if (!dependentId) {
      logger.warn(`Skipping dependency resolution for ${dependentUri}: declaration ID not found`);
      continue;
    }

    for (const dep of data.dependencies) {
      if (dep.type === "internal") {
        await resolveInternalDependencies(
          tx,
          dependentId,
          dependentUri,
          dep,
          declarationUriToIdMap,
          snapshotDeclarationsList,
          logger,
        );
      }
    }
  }
}

/**
 * Resolves internal dependencies for a specific declaration and creates dependency records.
 *
 * For each dependency name in the internal dependency object:
 * 1. Constructs the dependency URI as `{filePath}:{declarationName}`
 * 2. Attempts to find the dependency ID in the new declarations map
 * 3. Falls back to searching snapshot declarations if not found
 * 4. Creates a dependency record linking the dependent to the dependency
 * 5. Uses onConflictDoNothing to safely handle duplicate entries
 *
 * Internal dependencies are imports from other files in the same project.
 * Example: `import { UserModel } from './models/user'` creates an internal dependency
 * on the UserModel declaration.
 *
 * @param tx - Database transaction object
 * @param dependentId - ID of the declaration that has the dependency
 * @param dependentUri - URI of the dependent declaration (for logging)
 * @param dependency - Internal dependency object containing file path and list of dependency names
 * @param declarationUriToIdMap - Map of URIs to IDs for newly processed declarations
 * @param snapshotDeclarations - All declarations in the snapshot (for fallback lookup)
 * @param logger - Logger instance for tracking resolution failures
 */
async function resolveInternalDependencies(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  dependentId: string,
  dependentUri: string,
  dependency: Extract<DeclarationCodeMetadata["dependencies"][number], { type: "internal" }>,
  declarationUriToIdMap: Map<string, string>,
  snapshotDeclarationsList: Awaited<ReturnType<typeof getSnapshotDeclarations>>,
  logger: ReturnType<typeof Logger.get>,
): Promise<void> {
  for (const depName of dependency.dependsOn) {
    const dependencyUri = `${dependency.filePath}:${depName}`;

    let dependencyId = declarationUriToIdMap.get(dependencyUri);

    if (!dependencyId) {
      dependencyId = snapshotDeclarationsList.find((d) => d.declaration?.uri === dependencyUri)
        ?.declaration?.id;
    }

    if (dependencyId) {
      await tx
        .insert(dependencies)
        .values({
          dependentId,
          dependencyId,
        })
        .onConflictDoNothing();
    } else {
      logger.warn(`Could not resolve dependency: ${dependencyUri} for ${dependentUri}`);
    }
  }
}

/**
 * Updates an existing declaration with new code metadata from extracted source code.
 *
 * This operation occurs when:
 * - A declaration with the same URI already exists in the database
 * - The source code has been modified or re-extracted
 *
 * The function:
 * 1. Merges the new code metadata into the existing declaration's metadata
 * 2. Updates the progress to "enriching" to trigger enrichment processing
 * 3. Preserves other metadata fields (e.g., specs) that may exist
 *
 * @param tx - Database transaction object
 * @param declarationId - ID of the declaration to update
 * @param extractedDeclaration - New code metadata extracted from source
 * @param logger - Logger instance for tracking the update
 * @returns The declaration ID that was updated
 */
async function updateDeclaration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  declarationId: string,
  extractedDeclaration: DeclarationCodeMetadata,
): Promise<string> {
  const logger = Logger.get({
    declarationId,
  });

  logger.info(`Updating existing declaration ${declarationId} (matched by URI)`);

  await tx
    .update(declarations)
    .set({
      metadata: mergeJson(declarations.metadata, {
        codeMetadata: extractedDeclaration,
      }),
      progress: "enriching",
    })
    .where(eq(declarations.id, declarationId))
    .returning();

  return declarationId;
}

/**
 * Creates a brand new declaration for code that wasn't previously tracked.
 *
 * This operation occurs when:
 * - Code is found that doesn't match any existing declarations by URI
 * - Typically happens for:
 *   - Utility functions and helpers
 *   - Supporting types and interfaces
 *   - Class methods and properties
 *   - Code added outside the task system
 *
 * The created declaration includes:
 * - A unique ID (nanoid)
 * - URI pointing to the code location
 * - Code metadata extracted from source
 * - Progress set to "enriching" for AI enrichment
 * - Association with project and user
 *
 * @param tx - Database transaction object
 * @param extractedDeclaration - Code metadata extracted from source
 * @param filePath - File path where the declaration exists
 * @param projectId - ID of the project this declaration belongs to
 * @param userId - ID of the user who owns the project
 * @param logger - Logger instance for tracking creation
 * @returns The ID of the newly created declaration
 */
async function createDeclaration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  extractedDeclaration: DeclarationCodeMetadata,
  filePath: string,
  projectId: string,
  userId: string,
  logger: ReturnType<typeof Logger.get>,
): Promise<string> {
  const declarationId = nanoid();

  logger.info(
    `Creating NEW declaration ${declarationId} for ${extractedDeclaration.uri} (no match found)`,
  );

  await tx.insert(declarations).values({
    id: declarationId,
    uri: extractedDeclaration.uri,
    path: filePath,
    progress: "enriching",
    metadata: {
      version: "v1",
      codeMetadata: extractedDeclaration,
    },
    projectId,
    userId,
  });

  return declarationId;
}

/**
 * Main orchestration function that extracts declarations from source code and saves them to the database.
 *
 * This is the entry point for declaration processing and handles the complete workflow:
 *
 * **Process Flow:**
 *
 * 1. **Extract Declarations:**
 *    - Parses source code using TypeScript compiler
 *    - Identifies exportable declarations (functions, classes, types, etc.)
 *    - Extracts metadata (name, type, parameters, dependencies)
 *    - Resolves import paths using project-specific path aliases
 *
 * 2. **Prepare for Transaction:**
 *    - Fetch all snapshot declarations for the current snapshot
 *    - Identify completed declarations for cleanup
 *
 * 3. **Process Each Declaration (in transaction):**
 *    - Clean up completed declarations from previous runs
 *    - For each extracted declaration:
 *      - Check for existing declaration by URI
 *      - Determine operation (update/create)
 *      - Execute the appropriate operation
 *      - Build URI-to-ID mapping for dependency resolution
 *      - Link to current version if not already linked
 *      - Collect enriching jobs for AI processing
 *
 * 4. **Resolve Dependencies:**
 *    - Create dependency relationships between declarations
 *    - Map internal imports to declaration references
 *    - Build dependency graph for impact analysis
 *
 * 5. **Queue Enrichment:**
 *    - Queue AI enrichment jobs for each declaration
 *    - Enrichment adds descriptions, documentation, specs extraction
 *
 * **Key Features:**
 * - Atomic transaction ensures data consistency
 * - Handles create and update operations intelligently
 * - Cleans up stale data (completed declarations)
 * - Builds comprehensive dependency graph
 * - Queues asynchronous enrichment processing
 *
 * **Error Handling:**
 * - Logs errors with detailed context
 * - Transaction rollback on failure
 * - Continues processing despite individual enrichment failures
 *
 * @param context - Session context containing project, branch, version info
 * @param filePath - Relative path to the source file being processed
 * @param sourceCode - Complete source code content of the file
 * @param branchId - Branch ID for agentfs session
 */
export async function extractAndSaveDeclarations({
  context,
  filePath,
  sourceCode,
  branchId,
}: {
  context: ExecutionContext;
  filePath: string;
  sourceCode: string;
  branchId: string;
}): Promise<void> {
  const { project, branch } = context;

  const logger = Logger.get({
    projectId: project.id,
    snapshotId: branch.snapshot?.id,
  });

  if (!branch.snapshot) {
    logger.error("Branch has no snapshot");
    return;
  }

  const snapshotId = branch.snapshot.id;

  try {
    const pathAliases = getPathAliases(project.integrationCategories);

    const extracted = await extractDeclarations({
      sourceCode: sourceCode,
      filename: filePath,
      pathAliases,
      branchId,
      projectId: project.id,
      snapshotId,
    });

    logger.info(`Extracted ${extracted.length} declarations.`);

    if (extracted.length > 0) {
      const enrichingJobs: Array<{
        declarationId: string;
        codeMetadata: DeclarationCodeMetadata;
        filePath: string;
        sourceCode: string;
        projectId: string;
      }> = [];

      await db.transaction(async (tx) => {
        const snapshotDeclarationsList = await getSnapshotDeclarations(tx, snapshotId);

        const allDeclarations = snapshotDeclarationsList
          .map((d) => d.declaration)
          .filter((d): d is NonNullable<typeof d> => d !== null);

        const completedDeclarations = allDeclarations.filter((d) => d.progress === "completed");

        if (completedDeclarations.length > 0) {
          const idsToDelete = completedDeclarations.map((d) => d.id);
          await tx
            .delete(snapshotDeclarations)
            .where(
              and(
                inArray(snapshotDeclarations.declarationId, idsToDelete),
                eq(snapshotDeclarations.snapshotId, snapshotId),
              ),
            );
        }

        const newDeclarationUriToId = new Map<string, string>();

        for (const data of extracted) {
          logger.info(
            `Processing extracted declaration: ${data.uri} (name: ${data.name}, type: ${data.type}, isDefault: ${"isDefault" in data ? data.isDefault : "N/A"})`,
          );

          const [existingDeclarationByUri] = await tx
            .select({ id: declarations.id })
            .from(declarations)
            .where(and(eq(declarations.projectId, project.id), eq(declarations.uri, data.uri)))
            .limit(1);

          const decision = determineDeclarationOperation(
            data,
            allDeclarations,
            existingDeclarationByUri,
            logger,
          );

          let declarationId: string;

          switch (decision.type) {
            case "update": {
              declarationId = await updateDeclaration(tx, decision.declarationId, data);
              break;
            }

            case "create": {
              declarationId = await createDeclaration(
                tx,
                data,
                filePath,
                project.id,
                project.userId,
                logger,
              );
              break;
            }
          }

          newDeclarationUriToId.set(data.uri, declarationId);

          enrichingJobs.push({
            declarationId,
            codeMetadata: data,
            filePath,
            sourceCode,
            projectId: project.id,
          });

          const existingSnapshotLink = snapshotDeclarationsList.find(
            (sd) => sd.declarationId === declarationId,
          );

          if (!existingSnapshotLink) {
            await tx.insert(snapshotDeclarations).values({
              snapshotId: snapshotId,
              declarationId,
            });
          }
        }

        await resolveDependencies(
          tx,
          extracted,
          newDeclarationUriToId,
          snapshotDeclarationsList,
          logger,
        );
      });

      logger.info(`Successfully inserted ${extracted.length} declarations and linked to snapshot.`);

      for (const job of enrichingJobs) {
        await queueEnrichingJob(job);
      }
    }
  } catch (error) {
    logger.error("Failed to extract or save declarations", {
      extra: {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
    });
  }
}
