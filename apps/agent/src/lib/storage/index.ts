export * from "./agentfs";
export * from "./agentfs-manager";
export * from "./bash-tool";
export * from "./errors";
export * from "./snapshot";
export * from "./tigris-backend";
export * from "./types";

import { SnapshotService } from "./snapshot";
import { TigrisStorageBackend } from "./tigris-backend";
import type { StorageBackend } from "./types";

/**
 * Tigris configuration from environment variables
 */
function getTigrisConfig() {
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    endpoint: process.env.S3_ENDPOINT || "https://fly.storage.tigris.dev",
  };
}

/**
 * Factory to create the storage backend for a project
 * Uses Tigris object storage
 */
export function createStorageBackend(projectId: string): StorageBackend {
  const bucket = `project-${projectId}`;
  return new TigrisStorageBackend(bucket, getTigrisConfig());
}

/**
 * Factory to create a snapshot service for a project
 */
export function createSnapshotService(projectId: string): SnapshotService {
  const backend = createStorageBackend(projectId);
  return new SnapshotService(projectId, backend);
}
