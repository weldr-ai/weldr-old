import { join } from "node:path";

import { WORKSPACE_BASE } from "./workspace";

export const BRANCH_STATE_FILE = join(WORKSPACE_BASE, "weldr-branch-state.json");

export interface BranchMetadata {
  branchId: string;
  projectId: string;
  lastAccessedAt: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BranchState {
  branches: Record<string, BranchMetadata>;
}
