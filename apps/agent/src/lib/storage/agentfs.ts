import fs from "node:fs/promises";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import type { SyncResult } from "./types";

export type AgentFSInstance = Awaited<ReturnType<typeof AgentFS.open>>;

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
 * Sync files from AgentFS filesystem to actual disk.
 * Used before Git commits and builds that require physical files.
 */
export async function syncAgentFSToDisk(
  agent: AgentFSInstance,
  branchDir: string,
  options?: { exclude?: string[] },
): Promise<SyncResult> {
  const exclude = new Set(options?.exclude || ["agent.db", ".git", "node_modules"]);
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

      if (exclude.has(entry)) continue;

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
