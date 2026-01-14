import { promises as fs } from "node:fs";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

import { CloudStorageBackend, type CloudStorageConfig } from "./cloud-storage";
import { getSessionDbPath } from "./exec";
import type { StorageBackend } from "./types";

/**
 * Get cloud storage configuration from environment variables
 */
function getCloudStorageConfig(): CloudStorageConfig {
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    endpoint: process.env.S3_ENDPOINT || "https://fly.storage.tigris.dev",
  };
}

/**
 * Create a storage backend for a project
 */
export function createStorageBackend(projectId: string): StorageBackend {
  const bucket = `project-${projectId}`;
  return new CloudStorageBackend(bucket, getCloudStorageConfig());
}

/**
 * Checkpoint the WAL to merge all pending writes into the main database file.
 * This ensures the .db file contains all data before syncing to cloud storage.
 *
 * SQLite's WAL (Write-Ahead Log) stores recent writes in a separate file.
 * Running PRAGMA wal_checkpoint(TRUNCATE) merges the WAL into the main db
 * and truncates the WAL file to zero bytes.
 */
async function checkpointWal(branchId: string): Promise<void> {
  const logger = Logger.get({ branchId, component: "sync" });
  const dbPath = getSessionDbPath(branchId);

  try {
    const agent = await AgentFS.open({ path: dbPath });
    const db = agent.getDatabase();

    // TRUNCATE mode: checkpoint and truncate WAL to zero bytes
    const result = await db.pragma("wal_checkpoint(TRUNCATE)", {});
    logger.info("WAL checkpoint completed", { extra: { result } });

    await agent.close();
  } catch (error) {
    logger.warn("WAL checkpoint failed, continuing with sync", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

/**
 * Sync session state to cloud storage.
 * Checkpoints the WAL first to ensure all writes are in the main .db file,
 * then uploads the AgentFS database file (~/.weldr/db/{branchId}.db) to Tigris/S3.
 */
export async function syncToCloud(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing session to cloud storage");

  try {
    const agentfsPath = getSessionDbPath(branchId);

    try {
      await fs.access(agentfsPath);
    } catch {
      logger.info("No AgentFS database to sync");
      return { success: true };
    }

    // Checkpoint WAL to merge all writes into the main database file
    await checkpointWal(branchId);

    const agentfsData = await fs.readFile(agentfsPath);

    const backend = createStorageBackend(projectId);
    await backend.write(`branches/${branchId}.db`, agentfsData);

    logger.info("Session synced to cloud successfully", {
      extra: { dbSize: agentfsData.length },
    });
    return { success: true };
  } catch (error) {
    logger.error("Failed to sync session to cloud", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false };
  }
}

/**
 * Sync session state from cloud storage.
 * Downloads the AgentFS database file from Tigris/S3 to ~/.weldr/db/{branchId}.db.
 */
export async function syncFromCloud(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean; skipped: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing session from cloud storage");

  try {
    const agentfsPath = getSessionDbPath(branchId);
    const agentfsDir = path.dirname(agentfsPath);

    // Ensure ~/.weldr/db directory exists
    await fs.mkdir(agentfsDir, { recursive: true });

    const backend = createStorageBackend(projectId);
    const cloudPath = `branches/${branchId}.db`;

    const exists = await backend.exists(cloudPath);
    if (!exists) {
      logger.info("No data found in cloud storage for branch");
      return { success: true, skipped: true };
    }

    const agentfsData = await backend.read(cloudPath);
    await fs.writeFile(agentfsPath, agentfsData);

    logger.info("Session synced from cloud successfully", {
      extra: { dbSize: agentfsData.length },
    });

    return { success: true, skipped: false };
  } catch (error) {
    logger.error("Failed to sync session from cloud", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false, skipped: false };
  }
}
