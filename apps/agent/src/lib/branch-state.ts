import { db, eq } from "@weldr/db";
import { branches, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { createSnapshotService, syncFromCloud } from "@/lib/sandbox";
import { initSession, sessionExists } from "@/lib/sandbox/exec";
import { Git } from "./git";

/**
 * Ensure agentfs session exists for the branch.
 * Always syncs with cloud storage to ensure latest state.
 *
 * With the agentfs CLI architecture:
 * - Files are stored in the AgentFS SQLite database (~/.agentfs/{branchId}.db)
 * - All commands access files through FUSE overlay when executed via agentfs run
 * - No real directories are created - everything is virtual
 */
export async function ensureBranchSession(
  branchId: string,
  projectId: string,
): Promise<{
  status: "created" | "reused" | "forked";
}> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Ensuring agentfs session exists");

  const branch = await db.query.branches.findFirst({
    where: eq(branches.id, branchId),
    columns: {
      id: true,
      name: true,
      isMain: true,
      forkedFromVersionId: true,
    },
  });

  if (!branch) {
    throw new Error(`Branch not found: ${branchId}`);
  }

  // Check if agentfs session already exists
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

  if (branch.forkedFromVersionId && !branch.isMain) {
    logger.info("Creating branch from fork point", {
      extra: { forkedFromVersionId: branch.forkedFromVersionId },
    });

    return await createBranchFromFork(projectId, branchId, branch.forkedFromVersionId);
  }

  logger.info("Initializing branch session");

  // Try to sync from cloud first
  const syncResult = await syncFromCloud(branchId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    if (!syncResult.success) {
      logger.warn("Failed to sync from cloud, initializing empty session");
    }
    // Initialize a new agentfs session
    const initResult = initSession(branchId);
    if (initResult.exitCode !== 0) {
      logger.error("Failed to initialize agentfs session", { error: initResult.stderr });
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
 * Create a branch from a version fork point.
 * Uses sandbox snapshot to restore files from the forked version.
 *
 * With the agentfs CLI architecture:
 * - The snapshot is copied in cloud storage
 * - The database is downloaded locally to ~/.agentfs/{branchId}.db
 * - Files are accessed through FUSE overlay when commands run via agentfs run
 */
async function createBranchFromFork(
  projectId: string,
  branchId: string,
  forkedFromVersionId: string,
): Promise<{
  status: "forked";
}> {
  const logger = Logger.get({ branchId, forkedFromVersionId });

  const forkedVersion = await db.query.versions.findFirst({
    where: eq(versions.id, forkedFromVersionId),
    columns: {
      commitHash: true,
      snapshotPath: true,
    },
  });

  if (!forkedVersion) {
    throw new Error(`Forked version not found: ${forkedFromVersionId}`);
  }

  if (forkedVersion.snapshotPath) {
    logger.info("Restoring from sandbox snapshot", {
      extra: { snapshotPath: forkedVersion.snapshotPath },
    });

    const snapshotService = createSnapshotService(projectId);

    try {
      await snapshotService.forkFromVersion(forkedFromVersionId, branchId);

      const syncResult = await syncFromCloud(branchId, projectId);

      if (!syncResult.success) {
        throw new Error("Failed to sync forked branch from cloud");
      }

      logger.info("Branch forked from snapshot successfully");
    } catch (error) {
      logger.warn("Failed to restore from snapshot, initializing empty session", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Initialize a new agentfs session as fallback
      const initResult = initSession(branchId);
      if (initResult.exitCode !== 0) {
        logger.error("Failed to initialize agentfs session", { error: initResult.stderr });
      }
    }
  } else {
    logger.info("No snapshot available, initializing empty session");
    const initResult = initSession(branchId);
    if (initResult.exitCode !== 0) {
      logger.error("Failed to initialize agentfs session", { error: initResult.stderr });
    }
  }

  // Initialize git repository if needed
  const hasRepo = await Git.hasGitRepository(projectId, branchId);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId);
  }

  logger.info("Branch forked successfully", { extra: { forkedFromVersionId } });

  return { status: "forked" };
}
