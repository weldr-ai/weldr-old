import { homedir } from "node:os";
import path from "node:path";

/**
 * Check if running in local mode (local development)
 * vs cloud mode (Fly.io infrastructure)
 *
 * Uses WELDR_MODE environment variable:
 * - "local" or unset = local mode
 * - "cloud" = cloud mode
 *
 * Falls back to NODE_ENV if WELDR_MODE is not set for backwards compatibility
 */
export function isLocalMode(): boolean {
  const mode = process.env.WELDR_MODE?.toLowerCase();
  if (mode === "cloud") return false;
  if (mode === "local") return true;
  // Fallback to NODE_ENV for backwards compatibility
  return process.env.NODE_ENV === "development";
}

export function isCloudMode(): boolean {
  return !isLocalMode();
}

/**
 * Workspace base directory
 * Local: ~/.weldr
 * Cloud: /workspace
 */
export const WORKSPACE_BASE = isLocalMode() ? path.join(homedir(), ".weldr") : "/workspace";

export const WORKSPACE_DIR = WORKSPACE_BASE;

/**
 * Get the project directory path
 * Same structure in both local and cloud modes
 */
export function getProjectDir(projectId: string): string {
  return path.join(WORKSPACE_BASE, projectId);
}

/**
 * Get the branch directory path
 * Unified structure: {WORKSPACE_BASE}/{projectId}/{branchId}
 */
export function getBranchDir(projectId: string, branchId: string): string {
  return path.join(WORKSPACE_BASE, projectId, branchId);
}

/**
 * Get the main git repository path from project ID and main branch ID
 * Unified structure: {WORKSPACE_BASE}/{projectId}/{mainBranchId}
 */
export function getMainRepoPath(projectId: string, mainBranchId: string): string {
  return path.join(WORKSPACE_BASE, projectId, mainBranchId);
}

/**
 * Initialize workspace directory
 * Creates the workspace directory if it doesn't exist
 */
export async function initializeWorkspace(): Promise<void> {
  const fs = await import("node:fs/promises");
  try {
    await fs.mkdir(WORKSPACE_BASE, { recursive: true });
    console.log(`📁 Workspace initialized at: ${WORKSPACE_BASE}`);
  } catch (error) {
    // Ignore if directory already exists
    if ((error as { code?: string }).code !== "EEXIST") {
      throw error;
    }
  }
}
