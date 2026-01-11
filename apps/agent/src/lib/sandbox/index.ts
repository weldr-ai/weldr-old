/**
 * Sandbox Module
 *
 * Provides isolated virtual filesystem environments for AI agents.
 * Each agent works in its own sandbox backed by AgentFS (SQLite-based virtual FS).
 *
 * Architecture:
 * - Each branch has its own sandbox (AgentFS database)
 * - Sandboxes are stored in cloud storage (Tigris/S3) for persistence
 * - Snapshots provide version control (each commit creates a snapshot)
 * - Multiple agents can work on different branches without conflicts
 *
 * Key concepts:
 * - Sandbox: An isolated virtual filesystem for a branch
 * - Snapshot: An immutable point-in-time copy of a sandbox (a version/commit)
 * - Cloud Storage: Where sandbox state is persisted between sessions
 */

export * from "./agentfs";
export * from "./agentfs-exec";
export * from "./bash-tools";
export * from "./cloud-storage";
export * from "./connection-manager";
export * from "./custom-commands";
export * from "./errors";
export * from "./snapshots";
export * from "./sync";
export * from "./types";

import { SnapshotService } from "./snapshots";
import { createStorageBackend } from "./sync";

/**
 * Factory to create a snapshot service for a project
 */
export function createSnapshotService(projectId: string): SnapshotService {
  const backend = createStorageBackend(projectId);
  return new SnapshotService(projectId, backend);
}
