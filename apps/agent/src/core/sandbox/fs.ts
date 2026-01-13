/**
 * AgentFS Filesystem Operations
 *
 * Wrappers around the agentfs CLI for filesystem operations.
 * These provide direct access to the virtual filesystem without
 * needing to run commands through a shell.
 */

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { Logger } from "@weldr/shared/logger";

const AGENTFS_CLI = process.env.AGENTFS_CLI || path.join(os.homedir(), ".cargo", "bin", "agentfs");

export interface FsResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "directory";
}

export interface DiffEntry {
  path: string;
  status: "added" | "modified" | "deleted";
}

function filterAgentfsNoise(stderr: string): string {
  return stderr
    .split("\n")
    .filter(
      (line) => !line.includes("Welcome to AgentFS") && !line.includes("directories are writable"),
    )
    .join("\n");
}

/**
 * List files and directories in the AgentFS session.
 * Output format: "f <name>" for files, "d <name>" for directories.
 */
export function listDir(
  branchId: string,
  dirPath: string = "/",
): FsResult & { entries?: FileEntry[] } {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["fs", "ls", branchId, dirPath], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    const entries: FileEntry[] = [];
    const lines = (result.stdout || "").trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^([fd])\s+(.+)$/);
      if (match) {
        entries.push({
          type: match[1] === "d" ? "directory" : "file",
          name: match[2] ?? "",
        });
      }
    }

    return {
      success: true,
      data: result.stdout || "",
      entries,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to list directory", { error: errorMessage, dirPath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Read file contents from the AgentFS session.
 */
export function readFile(branchId: string, filePath: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["fs", "cat", branchId, filePath], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return {
      success: true,
      data: result.stdout || "",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to read file", { error: errorMessage, filePath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Write content to a file in the AgentFS session.
 */
export function writeFile(branchId: string, filePath: string, content: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["fs", "write", branchId, filePath, content], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return {
      success: true,
      data: result.stdout || "",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to write file", { error: errorMessage, filePath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Show filesystem changes in the overlay (uncommitted changes).
 */
export function getDiff(branchId: string): FsResult & { changes?: DiffEntry[] } {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["diff", branchId], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    const changes: DiffEntry[] = [];
    const lines = (result.stdout || "").trim().split("\n").filter(Boolean);

    for (const line of lines) {
      // Parse diff output - format depends on agentfs implementation
      // Common formats: "A path" (added), "M path" (modified), "D path" (deleted)
      const match = line.match(/^([AMD+-])\s+(.+)$/);
      if (match) {
        let status: DiffEntry["status"] = "modified";
        if (match[1] === "A" || match[1] === "+") status = "added";
        else if (match[1] === "D" || match[1] === "-") status = "deleted";

        changes.push({
          path: match[2] ?? "",
          status,
        });
      }
    }

    return {
      success: true,
      data: result.stdout || "",
      changes,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to get diff", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if a file exists in the AgentFS session.
 */
export function fileExists(branchId: string, filePath: string): boolean {
  const result = readFile(branchId, filePath);
  return result.success;
}

/**
 * Check if a directory exists in the AgentFS session.
 */
export function dirExists(branchId: string, dirPath: string): boolean {
  const result = listDir(branchId, dirPath);
  return result.success;
}

/**
 * Check if a path (file or directory) exists in the AgentFS session.
 */
export function pathExists(branchId: string, fsPath: string): boolean {
  return fileExists(branchId, fsPath) || dirExists(branchId, fsPath);
}

/**
 * Create a directory in the AgentFS session.
 * Uses `agentfs run` with mkdir command since there's no direct fs mkdir.
 */
export function createDir(branchId: string, dirPath: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["run", "--session", branchId, "mkdir", "-p", dirPath], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to create directory", { error: errorMessage, dirPath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a file in the AgentFS session.
 */
export function deleteFile(branchId: string, filePath: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["run", "--session", branchId, "rm", filePath], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to delete file", { error: errorMessage, filePath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a directory in the AgentFS session (recursive).
 */
export function deleteDir(branchId: string, dirPath: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["run", "--session", branchId, "rm", "-rf", dirPath], {
      env: { ...process.env, AGENTFS_QUIET: "1" },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to delete directory", { error: errorMessage, dirPath });
    return { success: false, error: errorMessage };
  }
}

/**
 * Copy a file in the AgentFS session.
 */
export function copyFile(branchId: string, source: string, destination: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(
      AGENTFS_CLI,
      ["run", "--session", branchId, "cp", source, destination],
      {
        env: { ...process.env, AGENTFS_QUIET: "1" },
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to copy file", { error: errorMessage, source, destination });
    return { success: false, error: errorMessage };
  }
}

/**
 * Copy a directory recursively in the AgentFS session.
 */
export function copyDir(branchId: string, source: string, destination: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(
      AGENTFS_CLI,
      ["run", "--session", branchId, "cp", "-r", source, destination],
      {
        env: { ...process.env, AGENTFS_QUIET: "1" },
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to copy directory", { error: errorMessage, source, destination });
    return { success: false, error: errorMessage };
  }
}

/**
 * Move/rename a file or directory in the AgentFS session.
 */
export function move(branchId: string, source: string, destination: string): FsResult {
  const logger = Logger.get({ component: "agentfs-fs", branchId });

  try {
    const result = spawnSync(
      AGENTFS_CLI,
      ["run", "--session", branchId, "mv", source, destination],
      {
        env: { ...process.env, AGENTFS_QUIET: "1" },
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    if (result.error || result.status !== 0) {
      return {
        success: false,
        error: result.error?.message || filterAgentfsNoise(result.stderr || "Command failed"),
      };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to move", { error: errorMessage, source, destination });
    return { success: false, error: errorMessage };
  }
}

/**
 * Recursively walk a directory and return all file paths.
 * Skips directories in the excludeDirs set.
 */
export function walkDir(
  branchId: string,
  dirPath: string,
  options?: {
    excludeDirs?: Set<string>;
    extensions?: Set<string>;
  },
): string[] {
  const excludeDirs = options?.excludeDirs ?? new Set();
  const extensions = options?.extensions;
  const files: string[] = [];

  function walk(currentPath: string): void {
    const result = listDir(branchId, currentPath);
    if (!result.success || !result.entries) return;

    for (const entry of result.entries) {
      const entryPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;

      if (entry.type === "directory") {
        if (!excludeDirs.has(entry.name)) {
          walk(entryPath);
        }
      } else {
        if (extensions) {
          const ext = path.extname(entry.name);
          if (extensions.has(ext)) {
            files.push(entryPath);
          }
        } else {
          files.push(entryPath);
        }
      }
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Check if a file exists and get basic stat info.
 * Returns success: true if it's a file, false otherwise.
 */
export function statFile(branchId: string, filePath: string): FsResult & { isFile?: boolean } {
  // Try to read the file - if successful, it's a file
  const readResult = readFile(branchId, filePath);
  if (readResult.success) {
    return { success: true, isFile: true };
  }

  // Check if it's a directory
  const dirResult = listDir(branchId, filePath);
  if (dirResult.success) {
    return { success: true, isFile: false };
  }

  return { success: false, error: "Path does not exist" };
}
