import { promises as fs } from "node:fs";
import path from "node:path";

import {
  agentFSExists,
  createSnapshotService,
  createStorageBackend,
  openAgentFS,
  syncAgentFSToDisk,
} from "@weldr/agent-storage";
import { db, eq } from "@weldr/db";
import { branches, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import {
  BRANCH_STATE_FILE,
  type BranchState,
  getBranchDir,
} from "@weldr/shared/state";

import { Git } from "./git";

export async function loadState(): Promise<BranchState> {
  try {
    const content = await fs.readFile(BRANCH_STATE_FILE, "utf-8");
    return JSON.parse(content) as BranchState;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return { branches: {} };
    }
    throw error;
  }
}

export async function saveState(state: BranchState): Promise<void> {
  const tmpFile = `${BRANCH_STATE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmpFile, BRANCH_STATE_FILE);
}

/**
 * Ensure branch directory exists with AgentFS initialized.
 * Works the same in local and cloud mode - always syncs with S3.
 */
export async function ensureBranchDir(
  branchId: string,
  projectId: string,
): Promise<{
  branchDir: string;
  status: "created" | "reused" | "forked";
}> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Ensuring branch directory exists");

  // Get branch information from database
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

  const branchDir = getBranchDir(projectId, branchId);

  // Check if AgentFS database already exists locally
  const agentfsExists = await agentFSExists(branchDir);

  if (agentfsExists) {
    logger.info("Branch directory already exists", { extra: { branchDir } });

    // Always try to sync from S3 to ensure we have latest
    const syncResult = await syncBranchFromStorage(branchId, projectId);

    if (!syncResult.success) {
      logger.warn(
        "Failed to sync existing branch from storage, using local copy",
      );
    }

    return { branchDir, status: "reused" };
  }

  // Create branch directory
  await fs.mkdir(branchDir, { recursive: true });

  // Handle forked branches - use snapshot service
  if (branch.forkedFromVersionId && !branch.isMain) {
    logger.info("Creating branch from fork point", {
      extra: { forkedFromVersionId: branch.forkedFromVersionId },
    });

    return await createBranchFromFork(
      projectId,
      branchId,
      branch.forkedFromVersionId,
      branchDir,
    );
  }

  // Main branch or new branch without fork point
  // Try to restore from S3 first, otherwise initialize empty
  logger.info("Initializing branch", { extra: { branchDir } });

  const syncResult = await syncBranchFromStorage(branchId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    // No data in S3 or sync failed, initialize empty AgentFS
    if (!syncResult.success) {
      logger.warn("Failed to sync from storage, initializing empty AgentFS");
    }
    const agent = await openAgentFS(branchDir);
    await agent.close();
  }

  // Initialize Git repository if needed
  if (!(await Git.hasGitRepository(branchDir))) {
    await Git.initRepository(projectId, branchId, branchDir);
  }

  return { branchDir, status: "created" };
}

/**
 * Create a branch from a version fork point.
 * Uses AgentFS snapshot to restore files from the forked version.
 */
async function createBranchFromFork(
  projectId: string,
  branchId: string,
  forkedFromVersionId: string,
  branchDir: string,
): Promise<{
  branchDir: string;
  status: "forked";
}> {
  const logger = Logger.get({ branchId, forkedFromVersionId });

  // Get the forked version's data
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

  // Try to restore from AgentFS snapshot if available
  if (forkedVersion.snapshotPath) {
    logger.info("Restoring from AgentFS snapshot", {
      extra: { snapshotPath: forkedVersion.snapshotPath },
    });

    const snapshotService = createSnapshotService(projectId);

    try {
      await snapshotService.forkFromVersion(forkedFromVersionId, branchId);

      // Download the forked database to local disk
      const syncResult = await syncBranchFromStorage(branchId, projectId);

      if (!syncResult.success) {
        throw new Error("Failed to sync forked branch from storage");
      }

      // Sync files from AgentFS to disk
      const agent = await openAgentFS(branchDir);
      try {
        const { synced, errors } = await syncAgentFSToDisk(agent, branchDir);

        logger.info("Files synced from snapshot", {
          extra: { synced, errorCount: errors.length },
        });
      } finally {
        await agent.close();
      }
    } catch (error) {
      logger.warn("Failed to restore from snapshot, initializing empty", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Initialize empty AgentFS if snapshot restore fails
      const agent = await openAgentFS(branchDir);
      await agent.close();
    }
  } else {
    // No snapshot available, initialize empty AgentFS
    logger.info("No snapshot available, initializing empty AgentFS");
    const agent = await openAgentFS(branchDir);
    await agent.close();
  }

  // Initialize Git repository
  if (!(await Git.hasGitRepository(branchDir))) {
    await Git.initRepository(projectId, branchId, branchDir);
  }

  logger.info("Branch forked successfully", {
    extra: { branchDir, forkedFromVersionId },
  });

  return { branchDir, status: "forked" };
}

/**
 * Sync branch to S3 storage.
 * Uploads the AgentFS database file.
 * Works the same in local (MinIO) and cloud (Tigris) modes.
 */
export async function syncBranchToStorage(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing branch to storage");

  try {
    const branchDir = getBranchDir(projectId, branchId);
    const agentfsPath = path.join(branchDir, "agent.db");

    // Check if AgentFS database exists
    try {
      await fs.access(agentfsPath);
    } catch {
      logger.info("No AgentFS database to sync");
      return { success: true };
    }

    // Read the local AgentFS database
    const agentfsData = await fs.readFile(agentfsPath);

    // Upload to S3
    const backend = createStorageBackend(projectId);
    await backend.write(`branches/${branchId}.db`, agentfsData);

    logger.info("Branch synced to storage successfully");
    return { success: true };
  } catch (error) {
    logger.error("Failed to sync branch to storage", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false };
  }
}

/**
 * Sync branch from S3 storage.
 * Downloads the AgentFS database file and syncs to disk.
 * Works the same in local (MinIO) and cloud (Tigris) modes.
 */
export async function syncBranchFromStorage(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean; skipped: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing branch from storage");

  try {
    const branchDir = getBranchDir(projectId, branchId);
    const agentfsPath = path.join(branchDir, "agent.db");

    // Ensure branch directory exists
    await fs.mkdir(branchDir, { recursive: true });

    // Download from S3
    const backend = createStorageBackend(projectId);
    const cloudPath = `branches/${branchId}.db`;

    const exists = await backend.exists(cloudPath);
    if (!exists) {
      logger.info("No data found in storage for branch");
      return { success: true, skipped: true };
    }

    const agentfsData = await backend.read(cloudPath);
    await fs.writeFile(agentfsPath, agentfsData);

    // Sync files from AgentFS to disk
    const agent = await openAgentFS(branchDir);
    try {
      const { synced, errors } = await syncAgentFSToDisk(agent, branchDir);

      logger.info("Branch synced from storage successfully", {
        extra: { synced, errorCount: errors.length },
      });

      return { success: true, skipped: false };
    } finally {
      await agent.close();
    }
  } catch (error) {
    logger.error("Failed to sync branch from storage", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false, skipped: false };
  }
}

// Keep old function names as aliases for backward compatibility
export const syncBranchToCloud = syncBranchToStorage;
export const syncBranchFromCloud = syncBranchFromStorage;
