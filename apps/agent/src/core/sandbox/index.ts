/**
 * Sandbox Module
 *
 * Provides isolated virtual filesystem environments for AI agents.
 * Each agent works in its own sandbox backed by AgentFS SDK.
 *
 * Architecture:
 * - Each version has its own isolated agentfs session (database stored in ~/.weldr/db/{versionId}.db)
 * - Sessions are synced to cloud storage (Tigris/S3) at project-{projectId}/version-{versionId}.db
 * - Multiple agents can work on different versions without conflicts
 *
 * Key concepts:
 * - Session: An isolated virtual filesystem for a version (via AgentFS SDK + just-bash)
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
  const backend = createStorageBackend();
  return new SnapshotService(projectId, backend);
}
