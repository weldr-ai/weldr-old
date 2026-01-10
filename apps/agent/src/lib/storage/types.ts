/**
 * Represents a point-in-time snapshot of a branch's state
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

/**
 * Abstract storage operations interface
 */
export interface StorageBackend {
  copy(source: string, dest: string): Promise<void>;
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

/**
 * Result of sync operations
 */
export interface SyncResult {
  synced: number;
  errors: string[];
}
