import { Logger } from "@weldr/shared/logger";

import type { StorageBackend } from "./types";

/**
 * Service for managing AgentFS snapshots
 */
export class SnapshotService {
  private logger = Logger.get({ service: "snapshot" });

  constructor(
    projectId: string,
    private backend: StorageBackend,
  ) {
    this.logger = Logger.get({ service: "snapshot", projectId });
  }

  /**
   * Get the storage path for a branch's AgentFS database
   */
  getBranchDbPath(branchId: string): string {
    return `branches/${branchId}.db`;
  }

  /**
   * Get snapshot path for a version
   */
  getSnapshotPath(versionId: string): string {
    return `snapshots/${versionId}.db`;
  }

  /**
   * Create a snapshot of the current branch state
   * This copies the AgentFS database to the snapshots directory
   */
  async createSnapshot(branchId: string, versionId: string): Promise<string> {
    const branchDbPath = this.getBranchDbPath(branchId);
    const snapshotPath = this.getSnapshotPath(versionId);

    this.logger.info("Creating snapshot", {
      extra: { branchId, versionId, snapshotPath },
    });

    await this.backend.copy(branchDbPath, snapshotPath);

    this.logger.info("Snapshot created", {
      extra: { branchId, versionId, snapshotPath },
    });

    return snapshotPath;
  }

  /**
   * Fork from a version - creates a new branch from a historical snapshot
   */
  async forkFromVersion(
    sourceVersionId: string,
    targetBranchId: string,
  ): Promise<string> {
    const snapshotPath = this.getSnapshotPath(sourceVersionId);
    const targetBranchDbPath = this.getBranchDbPath(targetBranchId);

    this.logger.info("Forking from version", {
      extra: { sourceVersionId, targetBranchId },
    });

    const exists = await this.backend.exists(snapshotPath);
    if (!exists) {
      throw new Error(`Snapshot not found for version: ${sourceVersionId}`);
    }

    await this.backend.copy(snapshotPath, targetBranchDbPath);

    this.logger.info("Fork completed", {
      extra: { sourceVersionId, targetBranchId },
    });

    return targetBranchDbPath;
  }

  /**
   * Restore a branch to a previous version's snapshot
   */
  async restoreSnapshot(versionId: string, branchId: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(versionId);
    const branchDbPath = this.getBranchDbPath(branchId);

    this.logger.info("Restoring snapshot", {
      extra: { versionId, branchId },
    });

    const exists = await this.backend.exists(snapshotPath);
    if (!exists) {
      throw new Error(`Snapshot not found for version: ${versionId}`);
    }

    await this.backend.copy(snapshotPath, branchDbPath);

    this.logger.info("Snapshot restored", {
      extra: { versionId, branchId },
    });
  }

  /**
   * List all snapshots for a project
   */
  async listSnapshots(): Promise<string[]> {
    return this.backend.list("snapshots/");
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(versionId: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(versionId);
    await this.backend.delete(snapshotPath);
  }

  /**
   * Check if a snapshot exists
   */
  async snapshotExists(versionId: string): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(versionId);
    return this.backend.exists(snapshotPath);
  }
}
