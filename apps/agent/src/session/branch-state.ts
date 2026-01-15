import { Logger } from "@weldr/shared/logger";

import { Git } from "@/core/git";
import { createSnapshotService, syncFromCloud } from "@/core/sandbox";
import { initSession, sessionExists } from "@/core/sandbox/exec";

/**
 * Ensure agentfs session exists for a version.
 * Each version has its own isolated DB file.
 *
 * - Files are stored in the AgentFS SQLite database (~/.weldr/db/{versionId}.db)
 * - All commands run through just-bash with the AgentFS virtual filesystem
 */
export async function ensureVersionSession(
  versionId: string,
  projectId: string,
  branchId: string,
  parentVersionId?: string | null,
): Promise<{
  status: "created" | "reused" | "forked";
}> {
  const logger = Logger.get({ versionId, projectId, branchId });

  logger.info("Ensuring agentfs session exists for version");

  // Check if agentfs session already exists locally
  const hasSession = sessionExists(versionId);

  if (hasSession) {
    logger.info("AgentFS session already exists", { extra: { versionId } });

    // Sync from cloud to get latest state
    const syncResult = await syncFromCloud(versionId, projectId);

    if (!syncResult.success) {
      logger.warn("Failed to sync existing version from cloud, using local copy");
    }

    return { status: "reused" };
  }

  // If we have a parent version, fork from it
  if (parentVersionId) {
    logger.info("Creating version from parent", {
      extra: { parentVersionId },
    });

    return await createVersionFromParent(projectId, branchId, versionId, parentVersionId);
  }

  logger.info("Initializing new version session");

  // Try to sync from cloud first (in case session exists in cloud but not locally)
  const syncResult = await syncFromCloud(versionId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    if (!syncResult.success) {
      logger.warn("Failed to sync from cloud, initializing empty session");
    }
    // Initialize a new agentfs session
    try {
      await initSession(versionId);
    } catch (error) {
      logger.error("Failed to initialize agentfs session", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, branchId);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId);
  }

  return { status: "created" };
}

/**
 * Create a new version from a parent version.
 * Copies the parent version's DB to the new version's DB.
 *
 * With the AgentFS SDK architecture:
 * - The parent version's DB is copied to the new version's path in cloud storage
 * - The database is downloaded locally to ~/.weldr/db/{versionId}.db
 * - Files are accessed through the AgentFS SDK virtual filesystem
 */
async function createVersionFromParent(
  projectId: string,
  branchId: string,
  versionId: string,
  parentVersionId: string,
): Promise<{
  status: "forked";
}> {
  const logger = Logger.get({ versionId, parentVersionId });

  const snapshotService = createSnapshotService(projectId);

  try {
    // Check if parent version exists in cloud storage
    const parentExists = await snapshotService.versionExists(parentVersionId);

    if (parentExists) {
      logger.info("Copying from parent version", {
        extra: { parentVersionId },
      });

      await snapshotService.forkFromVersion(parentVersionId, versionId);

      const syncResult = await syncFromCloud(versionId, projectId);

      if (!syncResult.success) {
        throw new Error("Failed to sync new version from cloud");
      }

      logger.info("Version created from parent successfully");
    } else {
      logger.info("Parent version not found in cloud, initializing empty session");
      await initSession(versionId);
    }
  } catch (error) {
    logger.warn("Failed to copy from parent version, initializing empty session", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Initialize a new agentfs session as fallback
    try {
      await initSession(versionId);
    } catch (initError) {
      logger.error("Failed to initialize agentfs session", {
        error: initError instanceof Error ? initError.message : String(initError),
      });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, branchId);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId);
  }

  logger.info("Version forked successfully", { extra: { parentVersionId } });

  return { status: "forked" };
}
