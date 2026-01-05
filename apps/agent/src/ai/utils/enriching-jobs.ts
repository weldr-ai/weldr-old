import { promises as fs } from "node:fs";
import * as path from "node:path";
import { and, eq, inArray, not } from "drizzle-orm";

import { db } from "@weldr/db";
import {
  declarations,
  nodes,
  projects,
  versionDeclarations,
  versions,
} from "@weldr/db/schema";
import { mergeJson } from "@weldr/db/utils";
import { Logger } from "@weldr/shared/logger";
import {
  getActiveProjectIds,
  getBranchDir,
  isLocalMode,
  WORKSPACE_DIR,
} from "@weldr/shared/state";
import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { findNodePosition, type NODE_DIMENSIONS } from "./declarations";
import { embedDeclaration } from "./embed-declarations";
import { enrichDeclaration } from "./enrich";
import {
  type ExtractedSpecs,
  extractSpecsFromCode,
  type SpecType,
} from "./extract-specs";

export interface EnrichingJobData {
  declarationId: string;
  codeMetadata: DeclarationCodeMetadata;
  filePath: string;
  sourceCode: string;
  projectId: string;
  retryCount?: number;
}

// Simple queue for semantic data jobs
const jobQueue: EnrichingJobData[] = [];
let isProcessing = false;
const MAX_RETRIES = 3;

export async function queueEnrichingJob(
  jobData: EnrichingJobData,
): Promise<void> {
  const logger = Logger.get({
    declarationId: jobData.declarationId,
    declarationName: jobData.codeMetadata.name,
    projectId: jobData.projectId,
  });

  try {
    // Set declaration status to "enriching" to mark it for processing
    await db
      .update(declarations)
      .set({ progress: "enriching" })
      .where(eq(declarations.id, jobData.declarationId));

    // Add to queue
    jobQueue.push(jobData);

    logger.info("Queued declaration for semantic data generation", {
      extra: {
        declarationId: jobData.declarationId,
        declarationName: jobData.codeMetadata.name,
        queueLength: jobQueue.length,
      },
    });

    // Process queue if not already processing
    if (!isProcessing) {
      processDeclarationsQueue();
    }
  } catch (error) {
    logger.error("Failed to queue semantic data generation job", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        declarationId: jobData.declarationId,
        projectId: jobData.projectId,
      },
    });
  }
}

export async function recoverEnrichingJobs(): Promise<void> {
  Logger.info("Recovering enriching jobs");

  let projectsList: Array<typeof projects.$inferSelect> = [];

  if (isLocalMode()) {
    // In local mode, recover projects based on IDs saved in metadata file
    const activeProjectIds = getActiveProjectIds();

    if (activeProjectIds.length === 0) {
      Logger.info("No active projects found in metadata file");
      return;
    }

    // Query projects by IDs from metadata file
    const projectsFromMetadata = await db.query.projects.findMany({
      where: inArray(projects.id, activeProjectIds),
    });

    projectsList = projectsFromMetadata;
  } else {
    // In cloud mode, each machine handles one project via PROJECT_ID
    if (!process.env.PROJECT_ID) {
      Logger.warn("PROJECT_ID not set in cloud mode");
      return;
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, process.env.PROJECT_ID),
    });
    if (project) {
      projectsList = [project];
    }
  }

  if (projectsList.length === 0) {
    return;
  }

  for (const project of projectsList) {
    const logger = Logger.get({
      projectId: project.id,
    });

    try {
      // Find declarations that are still in "enriching" state
      const versionsList = await db.query.versions.findMany({
        where: and(
          not(eq(versions.status, "planning")),
          eq(versions.projectId, project.id),
        ),
        with: {
          branch: true,
        },
      });

      for (const version of versionsList) {
        const declarationsList = await db.query.versionDeclarations.findMany({
          where: eq(versionDeclarations.versionId, version.id),
          with: {
            declaration: {
              columns: {
                id: true,
                path: true,
                metadata: true,
                progress: true,
              },
            },
          },
        });

        const enrichingDeclarations = declarationsList
          .map((declaration) => declaration.declaration)
          .filter((declaration) => declaration.progress === "enriching");

        if (enrichingDeclarations.length > 0) {
          logger.info(
            "Found declarations in enriching state, queueing for processing",
            {
              extra: { count: enrichingDeclarations.length },
            },
          );

          // Add recovered declarations to queue
          for (const declaration of enrichingDeclarations) {
            const codeMetadata = declaration.metadata?.codeMetadata;

            if (!declaration.path) {
              continue;
            }

            let sourceCodeContent: string;
            try {
              // In local mode, use branch-specific directory
              // In cloud mode, use WORKSPACE_DIR
              const workspaceDir = isLocalMode()
                ? getBranchDir(project.id, version.branch.id)
                : WORKSPACE_DIR;

              const fullPath = path.resolve(workspaceDir, declaration.path);

              // Security check: ensure path is within workspace
              if (!fullPath.startsWith(workspaceDir)) {
                logger.error("Path traversal attempt detected", {
                  extra: {
                    declarationId: declaration.id,
                    path: declaration.path,
                  },
                });
                continue;
              }

              sourceCodeContent = await fs.readFile(fullPath, "utf-8");
            } catch (error) {
              logger.error("Failed to read source code", {
                extra: {
                  declarationId: declaration.id,
                  error: error instanceof Error ? error.message : String(error),
                },
              });
              continue;
            }

            if (codeMetadata && declaration.path) {
              jobQueue.push({
                declarationId: declaration.id,
                codeMetadata,
                filePath: declaration.path,
                sourceCode: sourceCodeContent,
                projectId: project.id,
              });
            }
          }

          // Start processing if we have jobs
          if (jobQueue.length > 0) {
            processDeclarationsQueue();
          }
        }
      }
    } catch (error) {
      logger.error("Error recovering semantic data jobs", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
          projectId: project.id,
        },
      });
    }
  }

  Logger.info("Recovered enriching jobs");
}

/**
 * Creates a canvas node for a declaration with high-level specs.
 * Returns the created node or null if creation fails.
 */
async function createCanvasNodeForDeclaration(
  projectId: string,
  declarationId: string,
  specType: SpecType,
  logger: ReturnType<typeof Logger.get>,
): Promise<typeof nodes.$inferSelect | null> {
  try {
    return await db.transaction(async (tx) => {
      // Find a non-overlapping position for the new node
      const position = await findNodePosition(
        tx,
        projectId,
        specType as keyof typeof NODE_DIMENSIONS,
      );

      // Create the canvas node
      const [node] = await tx
        .insert(nodes)
        .values({
          projectId,
          position,
        })
        .returning();

      if (!node) {
        logger.error("Failed to create canvas node");
        return null;
      }

      // Link the node to the declaration
      await tx
        .update(declarations)
        .set({ nodeId: node.id })
        .where(eq(declarations.id, declarationId));

      logger.info("Created canvas node for declaration", {
        extra: {
          nodeId: node.id,
          position,
          specType,
        },
      });

      return node;
    });
  } catch (error) {
    logger.error("Failed to create canvas node", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        declarationId,
        specType,
      },
    });
    return null;
  }
}

async function enrichDeclarationJob(jobData: EnrichingJobData): Promise<void> {
  const logger = Logger.get({
    declarationId: jobData.declarationId,
    declarationName: jobData.codeMetadata.name,
  });

  try {
    logger.info("Processing semantic data generation", {
      extra: {
        declarationId: jobData.declarationId,
        declarationName: jobData.codeMetadata.name,
        declarationType: jobData.codeMetadata.type,
        filePath: jobData.filePath,
      },
    });

    // Step 1: Generate semantic data (descriptions, usage patterns, etc.)
    const semanticData = await enrichDeclaration(
      jobData.codeMetadata,
      jobData.filePath,
      jobData.sourceCode,
    );

    if (!semanticData) {
      handleJobRetry(jobData, "Failed to generate semantic data");
      return;
    }

    // Step 2: Try to extract high-level specs from the code
    let specs: ExtractedSpecs | null = null;
    try {
      specs = await extractSpecsFromCode(
        jobData.codeMetadata,
        jobData.filePath,
        jobData.sourceCode,
      );
    } catch (error) {
      // Log but don't fail - specs extraction is optional
      logger.warn("Failed to extract specs (non-fatal)", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // Step 3: Get the current declaration
    const declaration = await db.query.declarations.findFirst({
      where: eq(declarations.id, jobData.declarationId),
    });

    if (!declaration?.metadata) {
      logger.error("Declaration has no metadata", {
        extra: { declarationId: jobData.declarationId },
      });
      return;
    }

    // Step 4: Generate embedding
    const embedding = await embedDeclaration(declaration.metadata);

    // Step 5: Create canvas node if specs were extracted
    let nodeId: string | null = declaration.nodeId;
    if (specs && !declaration.nodeId) {
      const specType = specs.type as SpecType;
      const node = await createCanvasNodeForDeclaration(
        jobData.projectId,
        jobData.declarationId,
        specType,
        logger,
      );
      if (node) {
        nodeId = node.id;
      }
    }

    // Step 6: Update declaration with all enrichment data
    const updateData: Record<string, unknown> = {
      metadata: mergeJson(declarations.metadata, {
        semanticData,
        ...(specs && { specs }),
      }),
      embedding,
      progress: "completed",
    };

    // Include nodeId if we created a new node
    if (nodeId && nodeId !== declaration.nodeId) {
      updateData.nodeId = nodeId;
    }

    await db
      .update(declarations)
      .set(updateData)
      .where(eq(declarations.id, jobData.declarationId));

    logger.info("Successfully enriched declaration", {
      extra: {
        declarationId: jobData.declarationId,
        declarationName: jobData.codeMetadata.name,
        hasSpecs: !!specs,
        specType: specs?.type,
        hasNode: !!nodeId,
      },
    });
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    handleJobRetry(
      jobData,
      "Failed to process semantic data generation",
      errorObj,
    );
  }
}

async function processDeclarationsQueue(): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;
  while (jobQueue.length > 0) {
    // Take up to 5 jobs from the queue
    const batch = jobQueue.splice(0, 5);

    Logger.info("Processing semantic data batch", {
      extra: { batchSize: batch.length, remainingInQueue: jobQueue.length },
    });

    // Process all jobs in the batch concurrently
    await Promise.allSettled(
      batch.map(async (jobData) => {
        try {
          await enrichDeclarationJob(jobData);
        } catch (error) {
          Logger.error("Failed to process semantic data job", {
            extra: {
              error: error instanceof Error ? error.message : String(error),
              declarationId: jobData.declarationId,
            },
          });
        }
      }),
    );
  }

  isProcessing = false;
  Logger.info("Finished processing semantic data queue");
}

function handleJobRetry(
  jobData: EnrichingJobData,
  reason: string,
  error?: Error,
): boolean {
  const currentRetryCount = jobData.retryCount ?? 0;

  if (currentRetryCount >= MAX_RETRIES) {
    Logger.error(`${reason} after max retries, giving up`, {
      extra: {
        declarationId: jobData.declarationId,
        declarationName: jobData.codeMetadata.name,
        retryCount: currentRetryCount,
        maxRetries: MAX_RETRIES,
        ...(error && { error: error.message }),
      },
    });
    return false;
  }

  Logger.warn(`${reason}, retrying`, {
    extra: {
      declarationId: jobData.declarationId,
      declarationName: jobData.codeMetadata.name,
      retryCount: currentRetryCount + 1,
      maxRetries: MAX_RETRIES,
      ...(error && { error: error.message }),
    },
  });

  // Add back to queue with incremented retry count
  jobQueue.push({
    ...jobData,
    retryCount: currentRetryCount + 1,
  });

  return true;
}
