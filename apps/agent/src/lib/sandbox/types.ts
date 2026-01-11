/**
 * Represents a point-in-time snapshot of a branch's state (a commit/version)
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
 * Abstract storage backend interface for persisting sandbox state
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
 * Result of sync operations between virtual and physical filesystem
 */
export interface SyncResult {
  synced: number;
  errors: string[];
}

/**
 * Sandbox identifier
 */
export interface SandboxId {
  projectId: string;
  branchId: string;
}

/**
 * Sandbox initialization options
 */
export interface SandboxInitOptions {
  projectId: string;
  branchId: string;
  forkedFromVersionId?: string;
}

/**
 * Sandbox state after initialization
 */
export interface SandboxState {
  branchDir: string;
  status: "created" | "reused" | "forked";
}
