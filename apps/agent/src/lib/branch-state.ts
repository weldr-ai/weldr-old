import { promises as fs } from "node:fs";

import { db, eq } from "@weldr/db";
import { branches, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { BRANCH_STATE_FILE, type BranchState, getBranchDir } from "@weldr/shared/state";

import {
  agentFSExists,
  createSnapshotService,
  sandboxConnections,
  syncAgentFSToDisk,
  syncFromCloud,
} from "@/lib/sandbox";
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
 * Ensure branch directory exists with sandbox initialized.
 * Always syncs with cloud storage to ensure latest state.
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

  const sandboxExists = await agentFSExists(branchDir);

  if (sandboxExists) {
    logger.info("Branch directory already exists", { extra: { branchDir } });

    const syncResult = await syncFromCloud(branchId, projectId);

    if (!syncResult.success) {
      logger.warn("Failed to sync existing branch from cloud, using local copy");
    }

    return { branchDir, status: "reused" };
  }

  await fs.mkdir(branchDir, { recursive: true });

  if (branch.forkedFromVersionId && !branch.isMain) {
    logger.info("Creating branch from fork point", {
      extra: { forkedFromVersionId: branch.forkedFromVersionId },
    });

    return await createBranchFromFork(projectId, branchId, branch.forkedFromVersionId, branchDir);
  }

  logger.info("Initializing branch", { extra: { branchDir } });

  const syncResult = await syncFromCloud(branchId, projectId);

  if (syncResult.skipped || !syncResult.success) {
    if (!syncResult.success) {
      logger.warn("Failed to sync from cloud, initializing empty sandbox");
    }
    await sandboxConnections.acquire(projectId, branchId, branchDir);
    await sandboxConnections.release(projectId, branchId);
  }

  const hasRepo = await Git.hasGitRepository(projectId, branchId, branchDir);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId, branchDir);
  }

  return { branchDir, status: "created" };
}

/**
 * Create a branch from a version fork point.
 * Uses sandbox snapshot to restore files from the forked version.
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

      const agent = await sandboxConnections.acquire(projectId, branchId, branchDir);
      try {
        const { synced, errors } = await syncAgentFSToDisk(agent, branchDir);

        logger.info("Files synced from snapshot", {
          extra: { synced, errorCount: errors.length },
        });
      } finally {
        await sandboxConnections.release(projectId, branchId);
      }
    } catch (error) {
      logger.warn("Failed to restore from snapshot, initializing empty sandbox", {
        extra: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await sandboxConnections.acquire(projectId, branchId, branchDir);
      await sandboxConnections.release(projectId, branchId);
    }
  } else {
    logger.info("No snapshot available, initializing empty sandbox");
    await sandboxConnections.acquire(projectId, branchId, branchDir);
    await sandboxConnections.release(projectId, branchId);
  }

  const hasRepo = await Git.hasGitRepository(projectId, branchId, branchDir);
  if (!hasRepo) {
    await Git.initRepository(projectId, branchId, branchDir);
  }

  logger.info("Branch forked successfully", {
    extra: { branchDir, forkedFromVersionId },
  });

  return { branchDir, status: "forked" };
}
