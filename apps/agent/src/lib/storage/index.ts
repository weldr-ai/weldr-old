export * from "./agentfs";
export * from "./bash-tool";
export * from "./s3-backend";
export * from "./snapshot";
export * from "./types";

import { S3StorageBackend } from "./s3-backend";
import { SnapshotService } from "./snapshot";
import type { StorageBackend } from "./types";

/**
 * S3 configuration from environment variables
 * Works with MinIO (local) or Tigris (cloud)
 */
function getS3Config() {
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    endpoint: process.env.S3_ENDPOINT || "https://fly.storage.tigris.dev",
    region: process.env.S3_REGION || "auto",
  };
}

/**
 * Factory to create the storage backend for a project
 * Always uses S3-compatible storage (MinIO locally, Tigris in cloud)
 */
export function createStorageBackend(projectId: string): StorageBackend {
  const bucket = `project-${projectId}`;
  return new S3StorageBackend(bucket, getS3Config());
}

/**
 * Factory to create a snapshot service for a project
 */
export function createSnapshotService(projectId: string): SnapshotService {
  const backend = createStorageBackend(projectId);
  return new SnapshotService(projectId, backend);
}
