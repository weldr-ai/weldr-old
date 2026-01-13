/**
 * Sandbox Module
 *
 * Provides isolated virtual filesystem environments for AI agents.
 * Each agent works in its own sandbox backed by AgentFS CLI.
 *
 * Architecture:
 * - Each branch has its own agentfs session (database stored in ~/.agentfs/{branchId}.db)
 * - Sessions are synced to cloud storage (Tigris/S3) for persistence
 * - Snapshots provide version control (each commit creates a snapshot)
 * - Multiple agents can work on different branches without conflicts
 *
 * Key concepts:
 * - Session: An isolated virtual filesystem for a branch (via agentfs CLI)
 * - Snapshot: An immutable point-in-time copy of a session (a version/commit)
 * - Cloud Storage: Where session state is persisted between runs
 * - Executor: Command execution via agentfs run
 */

export * from "./cloud-storage";
export * from "./errors";
export * from "./exec";
export * from "./fs";
export * from "./snapshots";
export * from "./sync";
export * from "./types";

import { SnapshotService } from "./snapshots";
import { createStorageBackend } from "./sync";

export function createSnapshotService(projectId: string): SnapshotService {
  const backend = createStorageBackend(projectId);
  return new SnapshotService(projectId, backend);
}
