/**
 * Types for the agent storage system
 */

export interface VersionSnapshot {
  versionId: string;
  branchId: string;
  projectId: string;
  snapshotPath: string;
  commitHash: string | null;
  message: string | null;
  description: string | null;
  changedFiles: { path: string; type: "added" | "modified" | "deleted" }[];
  createdAt: Date;
}

export interface StorageBackend {
  /**
   * Copy a file from source to destination
   */
  copy(source: string, dest: string): Promise<void>;

  /**
   * Read a file and return its contents
   */
  read(path: string): Promise<Buffer>;

  /**
   * Write data to a file
   */
  write(path: string, data: Buffer): Promise<void>;

  /**
   * Delete a file
   */
  delete(path: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List files with a given prefix
   */
  list(prefix: string): Promise<string[]>;
}

export interface SyncResult {
  synced: number;
  errors: string[];
}
