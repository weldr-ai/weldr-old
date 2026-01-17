import { Logger } from "@weldr/shared/logger";

import type { StorageBackend } from "./types";

/**
 * Service for managing sandbox snapshots
 *
 * Each snapshot has its own isolated AgentFS database file stored in cloud storage.
 * The path is deterministic: project-{projectId}/snapshot-{snapshotId}.db
 *
 * Used for:
 * - Forking: copy from source snapshot's DB to target snapshot's DB
 * - Reverting: copy from a historical snapshot's DB to a new snapshot's DB
 * - Checking if a snapshot's DB exists
 */
export class SnapshotService {
  private logger = Logger.get({ service: "snapshot" });

  constructor(
    private projectId: string,
    private backend: StorageBackend,
  ) {
    this.logger = Logger.get({ service: "snapshot", projectId });
  }

  /**
   * Get the cloud storage path for a snapshot's DB file.
   * Each snapshot has its own isolated DB.
   * Path format: project-{projectId}/snapshot-{snapshotId}.db
   */
  getSnapshotDbPath(snapshotId: string): string {
    return `project-${this.projectId}/snapshot-${snapshotId}.db`;
  }

  /**
   * Fork from a snapshot - creates a new snapshot's DB from an existing snapshot's DB
   */
  async forkFromSnapshot(sourceSnapshotId: string, targetSnapshotId: string): Promise<string> {
    const sourcePath = this.getSnapshotDbPath(sourceSnapshotId);
    const targetPath = this.getSnapshotDbPath(targetSnapshotId);

    this.logger.info("Forking from snapshot", {
      extra: { sourceSnapshotId, targetSnapshotId },
    });

    const exists = await this.backend.exists(sourcePath);
    if (!exists) {
      throw new Error(`Snapshot DB not found: ${sourceSnapshotId}`);
    }

    await this.backend.copy(sourcePath, targetPath);

    this.logger.info("Fork completed", {
      extra: { sourceSnapshotId, targetSnapshotId },
    });

    return targetPath;
  }

  /**
   * Copy a snapshot's DB to another snapshot (used for revert operations)
   */
  async copySnapshot(sourceSnapshotId: string, targetSnapshotId: string): Promise<void> {
    const sourcePath = this.getSnapshotDbPath(sourceSnapshotId);
    const targetPath = this.getSnapshotDbPath(targetSnapshotId);

    this.logger.info("Copying snapshot", {
      extra: { sourceSnapshotId, targetSnapshotId },
    });

    const exists = await this.backend.exists(sourcePath);
    if (!exists) {
      throw new Error(`Snapshot DB not found: ${sourceSnapshotId}`);
    }

    await this.backend.copy(sourcePath, targetPath);

    this.logger.info("Snapshot copied", {
      extra: { sourceSnapshotId, targetSnapshotId },
    });
  }

  /**
   * List all snapshot DBs for a project
   */
  async listSnapshots(): Promise<string[]> {
    return this.backend.list(`project-${this.projectId}/snapshot-`);
  }

  /**
   * Delete a snapshot's DB
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshotPath = this.getSnapshotDbPath(snapshotId);
    await this.backend.delete(snapshotPath);
  }

  /**
   * Check if a snapshot's DB exists in cloud storage
   */
  async snapshotExists(snapshotId: string): Promise<boolean> {
    const snapshotPath = this.getSnapshotDbPath(snapshotId);
    return this.backend.exists(snapshotPath);
  }
}
