import { Logger } from "@weldr/shared/logger";

import { Git } from "@/core/git";
import { createSnapshotService, syncFromCloud } from "@/core/sandbox";
import { initSession, sessionExists } from "@/core/sandbox/exec";

/**
 * Ensure agentfs session exists for a branch.
 * Each branch has its own isolated DB file.
 *
 * - Files are stored in the AgentFS SQLite database (~/.weldr/db/{branchId}.db)
 * - All commands run through just-bash with the AgentFS virtual filesystem
 */
export async function ensureBranchSession(
  branchId: string,
  projectId: string,
  snapshotId: string,
  parentSnapshotId?: string | null,
): Promise<{
  status: "created" | "reused" | "forked";
}> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Ensuring agentfs session exists for branch");

  // Check if agentfs session already exists locally
  const hasSession = sessionExists(branchId);

  if (hasSession) {
    logger.info("AgentFS session already exists", { extra: { branchId } });

    // Sync from cloud to get latest state
    const syncResult = await syncFromCloud(branchId, projectId);

    if (!syncResult.success) {
      logger.warn("Failed to sync existing branch from cloud, using local copy");
    }

    return { status: "reused" };
  }

  // If we have a parent snapshot, fork from it
  if (parentSnapshotId) {
    logger.info("Creating branch from parent snapshot", {
      extra: { parentSnapshotId },
    });

    return await createBranchFromSnapshot(projectId, branchId, snapshotId, parentSnapshotId);
  }

  logger.info("Initializing new branch session");

  // Try to sync from cloud first (in case session exists in cloud but not locally)
  const syncResult = await syncFromCloud(branchId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    if (!syncResult.success) {
      logger.warn("Failed to sync from cloud, initializing empty session");
    }
    // Initialize a new agentfs session
    try {
      await initSession(branchId);
    } catch (error) {
      logger.error("Failed to initialize agentfs session", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, branchId, snapshotId);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId, snapshotId);
  }

  return { status: "created" };
}

/**
 * Create a new branch session from a parent snapshot.
 * Copies the snapshot's DB state to the new branch's DB.
 *
 * With the AgentFS SDK architecture:
 * - The snapshot's DB is copied to the new branch's path in cloud storage
 * - The database is downloaded locally to ~/.weldr/db/{branchId}.db
 * - Files are accessed through the AgentFS SDK virtual filesystem
 */
async function createBranchFromSnapshot(
  projectId: string,
  branchId: string,
  snapshotId: string,
  parentSnapshotId: string,
): Promise<{
  status: "forked";
}> {
  const logger = Logger.get({ branchId, parentSnapshotId });

  const snapshotService = createSnapshotService(projectId);

  try {
    // Check if parent snapshot exists in cloud storage
    const parentExists = await snapshotService.snapshotExists(parentSnapshotId);

    if (parentExists) {
      logger.info("Copying from parent snapshot", {
        extra: { parentSnapshotId },
      });

      await snapshotService.forkFromSnapshot(parentSnapshotId, branchId);

      const syncResult = await syncFromCloud(branchId, projectId);

      if (!syncResult.success) {
        throw new Error("Failed to sync new branch from cloud");
      }

      logger.info("Branch created from snapshot successfully");
    } else {
      logger.info("Parent snapshot not found in cloud, initializing empty session");
      await initSession(branchId);
    }
  } catch (error) {
    logger.warn("Failed to copy from parent snapshot, initializing empty session", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Initialize a new agentfs session as fallback
    try {
      await initSession(branchId);
    } catch (initError) {
      logger.error("Failed to initialize agentfs session", {
        error: initError instanceof Error ? initError.message : String(initError),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, branchId, snapshotId);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId, snapshotId);
  }

  logger.info("Branch forked successfully", { extra: { parentSnapshotId } });

  return { status: "forked" };
}
