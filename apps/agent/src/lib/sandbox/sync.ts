import { promises as fs } from "node:fs";
import path from "node:path";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { syncAgentFSToDisk } from "./agentfs";
import { CloudStorageBackend, type CloudStorageConfig } from "./cloud-storage";
import { sandboxConnections } from "./connection-manager";
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
 * Sync sandbox state to cloud storage.
 * Uploads the AgentFS database file to Tigris/S3.
 */
export async function syncToCloud(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing sandbox to cloud storage");

  try {
    const branchDir = getBranchDir(projectId, branchId);
    const agentfsPath = path.join(branchDir, "agent.db");

    try {
      await fs.access(agentfsPath);
    } catch {
      logger.info("No AgentFS database to sync");
      return { success: true };
    }

    const agentfsData = await fs.readFile(agentfsPath);

    const backend = createStorageBackend(projectId);
    await backend.write(`branches/${branchId}.db`, agentfsData);

    logger.info("Sandbox synced to cloud successfully");
    return { success: true };
  } catch (error) {
    logger.error("Failed to sync sandbox to cloud", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false };
  }
}

/**
 * Sync sandbox state from cloud storage.
 * Downloads the AgentFS database file and syncs virtual files to disk.
 */
export async function syncFromCloud(
  branchId: string,
  projectId: string,
): Promise<{ success: boolean; skipped: boolean }> {
  const logger = Logger.get({ branchId, projectId });

  logger.info("Syncing sandbox from cloud storage");

  try {
    const branchDir = getBranchDir(projectId, branchId);
    const agentfsPath = path.join(branchDir, "agent.db");

    await fs.mkdir(branchDir, { recursive: true });

    const backend = createStorageBackend(projectId);
    const cloudPath = `branches/${branchId}.db`;

    const exists = await backend.exists(cloudPath);
    if (!exists) {
      logger.info("No data found in cloud storage for branch");
      return { success: true, skipped: true };
    }

    const agentfsData = await backend.read(cloudPath);
    await fs.writeFile(agentfsPath, agentfsData);

    const agent = await sandboxConnections.acquire(projectId, branchId, branchDir);
    try {
      const { synced, errors } = await syncAgentFSToDisk(agent, branchDir);

      logger.info("Sandbox synced from cloud successfully", {
        extra: { synced, errorCount: errors.length },
      });

      return { success: true, skipped: false };
    } finally {
      await sandboxConnections.release(projectId, branchId);
    }
  } catch (error) {
    logger.error("Failed to sync sandbox from cloud", {
      extra: { error: error instanceof Error ? error.message : String(error) },
    });
    return { success: false, skipped: false };
  }
}
