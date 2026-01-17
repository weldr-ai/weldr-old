/**
 * Workspace Module
 *
 * Provides isolated virtual filesystem environments for AI agents.
 * Each agent works in its own workspace backed by AgentFS SDK.
 *
 * Architecture:
 * - Each snapshot has its own isolated agentfs workspace (database stored in ~/.weldr/db/{snapshotId}.db)
 * - Workspaces are synced to cloud storage (Tigris/S3) at project-{projectId}/snapshot-{snapshotId}.db
 * - Multiple agents can work on different snapshots without conflicts
 *
 * Key concepts:
 * - Workspace: An isolated virtual filesystem for a snapshot (via AgentFS SDK + just-bash)
 * - Cloud Storage: Where workspace state is persisted between runs
 * - just-bash: Provides 80+ built-in commands with custom git/bun support
 */

export * from "./cloud-storage";
export * from "./errors";
export * from "./exec";
export * from "./just-bash";
export * from "./snapshots";
export * from "./sync";
export * from "./types";

import { SnapshotService } from "./snapshots";
import { createStorageBackend } from "./sync";

export function createSnapshotService(projectId: string): SnapshotService {
  const backend = createStorageBackend();
  return new SnapshotService(projectId, backend);
}
