import { promises as fs } from "node:fs";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

import { CloudStorageBackend, type CloudStorageConfig } from "./cloud-storage";
import { getWorkspaceDbPath } from "./exec";
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
 * Create a storage backend
 */
export function createStorageBackend(): StorageBackend {
  const bucket = process.env.S3_BUCKET || "weldr-sandbox";
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
async function checkpointWal(snapshotId: string): Promise<void> {
  const logger = Logger.get({ snapshotId, component: "sync" });
  const dbPath = getWorkspaceDbPath(snapshotId);

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
 * then uploads the AgentFS database file (~/.weldr/db/{snapshotId}.db) to Tigris/S3.
 * Each snapshot has its own isolated DB file at snapshots/{snapshotId}.db.
 */
export async function syncToCloud(
  snapshotId: string,
  projectId: string,
): Promise<{ success: boolean }> {
  const logger = Logger.get({ snapshotId, projectId });

  logger.info("Syncing session to cloud storage");

  try {
    const agentfsPath = getWorkspaceDbPath(snapshotId);

    try {
      await fs.access(agentfsPath);
    } catch {
      logger.info("No AgentFS database to sync");
      return { success: true };
    }

    // Checkpoint WAL to merge all writes into the main database file
    await checkpointWal(snapshotId);

    const agentfsData = await fs.readFile(agentfsPath);

    const backend = createStorageBackend();
    await backend.write(`project-${projectId}/snapshot-${snapshotId}.db`, agentfsData);

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
 * Downloads the AgentFS database file from Tigris/S3 to ~/.weldr/db/{snapshotId}.db.
 * Each snapshot has its own isolated DB file at snapshots/{snapshotId}.db.
 */
export async function syncFromCloud(
  snapshotId: string,
  projectId: string,
): Promise<{ success: boolean; skipped: boolean }> {
  const logger = Logger.get({ snapshotId, projectId });

  logger.info("Syncing session from cloud storage");

  try {
    const agentfsPath = getWorkspaceDbPath(snapshotId);
    const agentfsDir = path.dirname(agentfsPath);

    // Ensure ~/.weldr/db directory exists
    await fs.mkdir(agentfsDir, { recursive: true });

    const backend = createStorageBackend();
    const cloudPath = `project-${projectId}/snapshot-${snapshotId}.db`;

    const exists = await backend.exists(cloudPath);
    if (!exists) {
      logger.info("No data found in cloud storage for snapshot");
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
