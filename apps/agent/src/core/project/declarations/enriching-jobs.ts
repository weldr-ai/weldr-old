import { eq } from "drizzle-orm";

import { db } from "@weldr/db";
import { branches, declarations, nodes, projects, snapshotDeclarations } from "@weldr/db/schema";
import { mergeJson } from "@weldr/db/utils";
import { Logger } from "@weldr/shared/logger";
import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { embedDeclaration } from "@/core/project/declarations/embed";
import { enrichDeclaration } from "@/core/project/declarations/enrich";
import { findNodePosition, type NODE_DIMENSIONS } from "@/core/project/node-placement";
import { getOrCreateSession } from "@/core/sandbox/just-bash/session";
import { type ExtractedSpecs, extractSpecsFromCode, type SpecType } from "./extract-specs";

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

export async function queueEnrichingJob(jobData: EnrichingJobData): Promise<void> {
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

/**
 * Recover enriching jobs on startup.
 * Queries the database for declarations that are in "enriching" state.
 */
export async function recoverEnrichingJobs(): Promise<void> {
  Logger.info("Recovering enriching jobs");

  // Get project ID from environment
  const projectId = process.env.PROJECT_ID;

  if (!projectId) {
    Logger.info("No PROJECT_ID set, skipping enriching jobs recovery");
    return;
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    Logger.warn(`Project not found: ${projectId}`);
    return;
  }

  const logger = Logger.get({ projectId: project.id });

  try {
    // Find declarations that are still in "enriching" state
    // Get snapshots for this project via branches
    const branchesList = await db.query.branches.findMany({
      where: eq(branches.projectId, project.id),
      with: {
        snapshot: true,
      },
    });

    for (const branch of branchesList) {
      if (!branch.snapshot) continue;
      const snapshotRecord = branch.snapshot;
      const declarationsList = await db.query.snapshotDeclarations.findMany({
        where: eq(snapshotDeclarations.snapshotId, snapshotRecord.id),
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
        logger.info("Found declarations in enriching state, queueing for processing", {
          extra: { count: enrichingDeclarations.length },
        });

        // Add recovered declarations to queue
        for (const declaration of enrichingDeclarations) {
          const codeMetadata = declaration.metadata?.codeMetadata;

          if (!declaration.path) {
            continue;
          }

          try {
            const session = await getOrCreateSession({
              projectId: project.id,
              snapshotId: snapshotRecord.id,
            });

            const agentfsPath = declaration.path.startsWith("/")
              ? declaration.path
              : `/${declaration.path}`;
            const sourceCodeContent = await session.agent.fs.readFile(agentfsPath, "utf-8");

            if (codeMetadata && declaration.path) {
              jobQueue.push({
                declarationId: declaration.id,
                codeMetadata,
                filePath: declaration.path,
                sourceCode: sourceCodeContent,
                projectId: project.id,
              });
            }
          } catch (error) {
            logger.error("Failed to read source code", {
              extra: {
                declarationId: declaration.id,
                error: error instanceof Error ? error.message : String(error),
              },
            });
            continue;
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

    await db.update(declarations).set(updateData).where(eq(declarations.id, jobData.declarationId));

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
    handleJobRetry(jobData, "Failed to process semantic data generation", errorObj);
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

function handleJobRetry(jobData: EnrichingJobData, reason: string, error?: Error): boolean {
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
