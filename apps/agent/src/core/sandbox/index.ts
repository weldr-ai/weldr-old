/**
 * Sandbox Module
 *
 * Provides isolated virtual filesystem environments for AI agents.
 * Each agent works in its own sandbox backed by AgentFS SDK.
 *
 * Architecture:
 * - Each branch has its own agentfs session (database stored in ~/.weldr/db/{branchId}.db)
 * - Sessions are synced to cloud storage (Tigris/S3) for persistence
 * - Snapshots provide version control (each commit creates a snapshot)
 * - Multiple agents can work on different branches without conflicts
 *
 * Key concepts:
 * - Session: An isolated virtual filesystem for a branch (via AgentFS SDK + just-bash)
 * - Snapshot: An immutable point-in-time copy of a session (a version/commit)
 * - Cloud Storage: Where session state is persisted between runs
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
  const backend = createStorageBackend(projectId);
  return new SnapshotService(projectId, backend);
}
