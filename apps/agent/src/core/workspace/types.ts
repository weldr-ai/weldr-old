/**
 * Represents a point-in-time snapshot of a branch's state
 */
export interface SnapshotRecord {
  snapshotId: string;
  branchId: string;
  projectId: string;
  commitHash: string | null;
  message: string | null;
  description: string | null;
  changedFiles: { path: string; type: "added" | "modified" | "deleted" }[];
  createdAt: Date;
}

/**
 * Abstract storage backend interface for persisting workspace state
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
 * Workspace identifier
 */
export interface WorkspaceId {
  projectId: string;
  branchId: string;
}

/**
 * Workspace initialization options
 */
export interface WorkspaceInitOptions {
  projectId: string;
  branchId: string;
  forkedFromSnapshotId?: string;
}

/**
 * Workspace state after initialization
 */
export interface WorkspaceState {
  branchDir: string;
  status: "created" | "reused" | "forked";
}
