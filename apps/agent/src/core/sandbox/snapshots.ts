import { Logger } from "@weldr/shared/logger";

import type { StorageBackend } from "./types";

/**
 * Service for managing sandbox snapshots (versions)
 *
 * Each version has its own isolated AgentFS database file stored in cloud storage.
 * The path is deterministic: project-{projectId}/version-{versionId}.db
 *
 * Used for:
 * - Forking: copy from source version's DB to target version's DB
 * - Reverting: copy from a historical version's DB to a new version's DB
 * - Checking if a version's snapshot exists
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
   * Get the cloud storage path for a version's DB file.
   * Each version has its own isolated DB.
   * Path format: project-{projectId}/version-{versionId}.db
   */
  getVersionDbPath(versionId: string): string {
    return `project-${this.projectId}/version-${versionId}.db`;
  }

  /**
   * Fork from a version - creates a new version's DB from an existing version's DB
   */
  async forkFromVersion(sourceVersionId: string, targetVersionId: string): Promise<string> {
    const sourcePath = this.getVersionDbPath(sourceVersionId);
    const targetPath = this.getVersionDbPath(targetVersionId);

    this.logger.info("Forking from version", {
      extra: { sourceVersionId, targetVersionId },
    });

    const exists = await this.backend.exists(sourcePath);
    if (!exists) {
      throw new Error(`Version DB not found: ${sourceVersionId}`);
    }

    await this.backend.copy(sourcePath, targetPath);

    this.logger.info("Fork completed", {
      extra: { sourceVersionId, targetVersionId },
    });

    return targetPath;
  }

  /**
   * Copy a version's DB to another version (used for revert operations)
   */
  async copyVersion(sourceVersionId: string, targetVersionId: string): Promise<void> {
    const sourcePath = this.getVersionDbPath(sourceVersionId);
    const targetPath = this.getVersionDbPath(targetVersionId);

    this.logger.info("Copying version", {
      extra: { sourceVersionId, targetVersionId },
    });

    const exists = await this.backend.exists(sourcePath);
    if (!exists) {
      throw new Error(`Version DB not found: ${sourceVersionId}`);
    }

    await this.backend.copy(sourcePath, targetPath);

    this.logger.info("Version copied", {
      extra: { sourceVersionId, targetVersionId },
    });
  }

  /**
   * List all version DBs for a project
   */
  async listVersions(): Promise<string[]> {
    return this.backend.list(`project-${this.projectId}/version-`);
  }

  /**
   * Delete a version's DB
   */
  async deleteVersion(versionId: string): Promise<void> {
    const versionPath = this.getVersionDbPath(versionId);
    await this.backend.delete(versionPath);
  }

  /**
   * Check if a version's DB exists in cloud storage
   */
  async versionExists(versionId: string): Promise<boolean> {
    const versionPath = this.getVersionDbPath(versionId);
    return this.backend.exists(versionPath);
  }
}
