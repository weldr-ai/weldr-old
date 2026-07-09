import { Logger } from "@weldr/shared/logger";

import { Git } from "@/core/git";
import { initWorkspace, workspaceExists } from "./exec";
import { SnapshotService } from "./snapshots";
import { createStorageBackend, syncFromCloud } from "./sync";

/**
 * Ensure agentfs workspace exists for a snapshot.
 * Each snapshot has its own isolated DB file.
 *
 * - Files are stored in the AgentFS SQLite database (~/.weldr/db/{snapshotId}.db)
 * - All commands run through just-bash with the AgentFS virtual filesystem
 */
export async function ensureSnapshotWorkspace(
  snapshotId: string,
  projectId: string,
  parentSnapshotId?: string | null,
): Promise<{
  status: "created" | "reused" | "forked";
}> {
  const logger = Logger.get({ snapshotId, projectId });

  logger.info("Ensuring agentfs workspace exists for snapshot");

  // Check if agentfs workspace already exists locally
  const hasSession = workspaceExists(snapshotId);

  if (hasSession) {
    logger.info("AgentFS workspace already exists", { extra: { snapshotId } });

    // Sync from cloud to get latest state
    const syncResult = await syncFromCloud(snapshotId, projectId);

    if (!syncResult.success) {
      logger.warn("Failed to sync existing snapshot from cloud, using local copy");
    }

    return { status: "reused" };
  }

  // If we have a parent snapshot, fork from it
  if (parentSnapshotId) {
    logger.info("Creating snapshot from parent snapshot", {
      extra: { parentSnapshotId },
    });

    return await createSnapshotFromParent(projectId, snapshotId, parentSnapshotId);
  }

  logger.info("Initializing new snapshot workspace");

  // Try to sync from cloud first (in case session exists in cloud but not locally)
  const syncResult = await syncFromCloud(snapshotId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    if (!syncResult.success) {
      logger.warn("Failed to sync from cloud, initializing empty workspace");
    }
    // Initialize a new agentfs workspace
    try {
      await initWorkspace(snapshotId);
    } catch (error) {
      logger.error("Failed to initialize agentfs workspace", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, snapshotId);
  if (!hasRepo) {
    await Git.initRepository(projectId, snapshotId);
  }

  return { status: "created" };
}

/**
 * Create a new snapshot session from a parent snapshot.
 * Copies the parent snapshot's DB state to the new snapshot's DB.
 *
 * With the AgentFS SDK architecture:
 * - The parent snapshot's DB is copied to the new snapshot's path in cloud storage
 * - The database is downloaded locally to ~/.weldr/db/{snapshotId}.db
 * - Files are accessed through the AgentFS SDK virtual filesystem
 */
async function createSnapshotFromParent(
  projectId: string,
  snapshotId: string,
  parentSnapshotId: string,
): Promise<{
  status: "forked";
}> {
  const logger = Logger.get({ snapshotId, parentSnapshotId });

  const backend = createStorageBackend();
  const snapshotService = new SnapshotService(projectId, backend);

  try {
    // Check if parent snapshot exists in cloud storage
    const parentExists = await snapshotService.snapshotExists(parentSnapshotId);

    if (parentExists) {
      logger.info("Copying from parent snapshot", {
        extra: { parentSnapshotId },
      });

      await snapshotService.forkFromSnapshot(parentSnapshotId, snapshotId);

      const syncResult = await syncFromCloud(snapshotId, projectId);

      if (!syncResult.success) {
        throw new Error("Failed to sync new snapshot from cloud");
      }

      logger.info("Snapshot created from parent successfully");
    } else {
      logger.info("Parent snapshot not found in cloud, initializing empty workspace");
      await initWorkspace(snapshotId);
    }
  } catch (error) {
    logger.warn("Failed to copy from parent snapshot, initializing empty workspace", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Initialize a new agentfs workspace as fallback
    try {
      await initWorkspace(snapshotId);
    } catch (initError) {
      logger.error("Failed to initialize agentfs workspace", {
        error: initError instanceof Error ? initError.message : String(initError),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, snapshotId);
  if (!hasRepo) {
    await Git.initRepository(projectId, snapshotId);
  }

  logger.info("Snapshot forked successfully", { extra: { parentSnapshotId } });

  return { status: "forked" };
}
