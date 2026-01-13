import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Logger } from "@weldr/shared/logger";

import { CloudStorageBackend, type CloudStorageConfig } from "./cloud-storage";
import type { StorageBackend } from "./types";

/**
 * Get the path to the AgentFS database for a session.
 * AgentFS CLI stores databases in ~/.agentfs/{branchId}.db
 */
export function getSessionDbPath(branchId: string): string {
  return path.join(os.homedir(), ".agentfs", `${branchId}.db`);
}

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
 * Sync session state to cloud storage.
 * Uploads the AgentFS database file (~/.agentfs/{branchId}.db) to Tigris/S3.
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

    const agentfsData = await fs.readFile(agentfsPath);

    const backend = createStorageBackend(projectId);
    await backend.write(`branches/${branchId}.db`, agentfsData);

    logger.info("Session synced to cloud successfully");
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
 * Downloads the AgentFS database file from Tigris/S3 to ~/.agentfs/{branchId}.db.
 *
 * When running with `agentfs run`, files are accessed through FUSE overlay
 * directly from the database, so no additional disk sync is needed.
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

    // Ensure ~/.agentfs directory exists
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
