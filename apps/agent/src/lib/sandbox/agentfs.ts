import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import type { SyncResult } from "./types";

export type AgentFSInstance = Awaited<ReturnType<typeof AgentFS.open>>;

/**
 * Load and parse .gitignore patterns from a directory
 */
export async function loadGitignorePatterns(branchDir: string): Promise<string[]> {
  const gitignorePath = path.join(branchDir, ".gitignore");

  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Check if a relative path matches any gitignore pattern
 */
export function isIgnoredByGitignore(relativePath: string, patterns: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    if (normalizedPattern.endsWith("/")) {
      const dirPattern = normalizedPattern.slice(0, -1);
      if (normalizedPath === dirPattern || normalizedPath.startsWith(dirPattern + "/")) {
        return true;
      }
    } else if (normalizedPattern.includes("*")) {
      const regexPattern = normalizedPattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/{{GLOBSTAR}}/g, ".*");

      const regex = new RegExp(
        `^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`,
      );
      if (regex.test(normalizedPath)) {
        return true;
      }

      const pathParts = normalizedPath.split("/");
      const filenameRegex = new RegExp(`^${regexPattern}$`);
      if (pathParts.some((part) => filenameRegex.test(part))) {
        return true;
      }
    } else {
      if (normalizedPath === normalizedPattern) {
        return true;
      }
      if (normalizedPath.startsWith(normalizedPattern + "/")) {
        return true;
      }
      const pathParts = normalizedPath.split("/");
      if (pathParts.includes(normalizedPattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Open or create an AgentFS instance for a branch
 */
export async function openAgentFS(branchDir: string): Promise<AgentFSInstance> {
  const agentfsPath = path.join(branchDir, "agent.db");

  await fs.mkdir(branchDir, { recursive: true });

  const agent = await AgentFS.open({ path: agentfsPath });

  return agent;
}

/**
 * Sync files from AgentFS virtual filesystem to actual disk.
 * Used before Git commits and builds that require physical files.
 */
export async function syncAgentFSToDisk(
  agent: AgentFSInstance,
  branchDir: string,
  options?: { exclude?: string[] },
): Promise<SyncResult> {
  const exclude = new Set(options?.exclude || ["agent.db", ".git", "node_modules"]);
  const gitignorePatterns = await loadGitignorePatterns(branchDir);
  let synced = 0;
  const errors: string[] = [];

  async function syncDir(agentPath: string, diskPath: string) {
    let entries: string[];
    try {
      entries = await agent.fs.readdir(agentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryAgentPath = path.posix.join(agentPath, entry);
      const entryDiskPath = path.join(diskPath, entry);
      const relativePath = path.relative(branchDir, entryDiskPath);

      if (exclude.has(entry)) continue;
      if (isIgnoredByGitignore(relativePath, gitignorePatterns)) continue;

      try {
        const stat = await agent.fs.stat(entryAgentPath);

        if (stat.isDirectory()) {
          await fs.mkdir(entryDiskPath, { recursive: true });
          await syncDir(entryAgentPath, entryDiskPath);
        } else {
          const content = await agent.fs.readFile(entryAgentPath);
          await fs.mkdir(path.dirname(entryDiskPath), { recursive: true });
          await fs.writeFile(entryDiskPath, content);
          synced++;
        }
      } catch (err) {
        errors.push(
          `Failed to sync ${entryAgentPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  await syncDir("/", branchDir);

  return { synced, errors };
}

/**
 * Sync files from real disk back to AgentFS virtual filesystem.
 * Used to import external changes into the virtual filesystem.
 */
export async function syncDiskToAgentFS(
  agent: AgentFSInstance,
  branchDir: string,
  options?: { exclude?: string[]; include?: string[] },
): Promise<SyncResult> {
  const exclude = new Set(
    options?.exclude || ["agent.db", "agent.db-wal", "agent.db-shm", ".git", "node_modules"],
  );
  const include = options?.include;
  const gitignorePatterns = await loadGitignorePatterns(branchDir);
  let synced = 0;
  const errors: string[] = [];

  async function syncDir(diskPath: string, agentPath: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(diskPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryName = entry.name as string;
      const entryDiskPath = path.join(diskPath, entryName);
      const entryAgentPath = path.posix.join(agentPath, entryName);
      const relativePath = path.relative(branchDir, entryDiskPath);

      if (exclude.has(entryName)) continue;
      if (isIgnoredByGitignore(relativePath, gitignorePatterns)) continue;

      if (include) {
        const isIncluded = include.some((pattern) => {
          return relativePath === pattern || relativePath.startsWith(pattern + path.sep);
        });
        if (!isIncluded) continue;
      }

      try {
        if (entry.isDirectory()) {
          await agent.fs.mkdir(entryAgentPath);
          await syncDir(entryDiskPath, entryAgentPath);
        } else if (entry.isFile()) {
          const content = await fs.readFile(entryDiskPath);
          const parentDir = path.posix.dirname(entryAgentPath);
          if (parentDir !== "/") {
            await agent.fs.mkdir(parentDir);
          }
          await agent.fs.writeFile(entryAgentPath, content);
          synced++;
        }
      } catch (err) {
        errors.push(
          `Failed to sync ${relativePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  await syncDir(branchDir, "/");

  return { synced, errors };
}

/**
 * Get the AgentFS database path for a branch
 */
export function getAgentFSPath(branchDir: string): string {
  return path.join(branchDir, "agent.db");
}

/**
 * Check if an AgentFS database exists for a branch
 */
export async function agentFSExists(branchDir: string): Promise<boolean> {
  try {
    await fs.access(getAgentFSPath(branchDir));
    return true;
  } catch {
    return false;
  }
}
