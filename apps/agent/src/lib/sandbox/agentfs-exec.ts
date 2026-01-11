import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { Logger } from "@weldr/shared/logger";

import { type AgentFSInstance, syncAgentFSToDisk, syncDiskToAgentFS } from "./agentfs";

/**
 * Options for executing a real binary with AgentFS sync
 */
export interface RealBinaryExecOptions {
  /**
   * AgentFS instance for sync operations
   */
  agent: AgentFSInstance;

  /**
   * Branch directory (real disk path)
   */
  branchDir: string;

  /**
   * Files/dirs to sync back after command (e.g., ["bun.lockb", "package-lock.json"] for bun install)
   */
  syncBackPatterns?: string[];

  /**
   * Timeout in milliseconds (default: 5 minutes)
   */
  timeout?: number;
}

/**
 * Result of executing a real binary
 */
export interface RealBinaryExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a real binary with AgentFS sync.
 *
 * This approach:
 * 1. Syncs AgentFS virtual filesystem to disk before execution
 * 2. Runs the real binary directly in the branch directory
 * 3. Syncs specified results back to AgentFS after execution
 *
 * @param command - The command to execute (e.g., "bun", "git")
 * @param args - Arguments for the command
 * @param options - Execution options including agent instance and branchDir
 * @returns Promise resolving to stdout, stderr, and exit code
 */
export async function execRealBinary(
  command: string,
  args: string[],
  options: RealBinaryExecOptions,
): Promise<RealBinaryExecResult> {
  const { agent, branchDir, syncBackPatterns, timeout = 5 * 60 * 1000 } = options;

  const logger = Logger.get({ component: "agentfs-exec", command, branchDir });

  try {
    logger.debug("Syncing AgentFS to disk before command execution");
    const syncResult = await syncAgentFSToDisk(agent, branchDir);
    logger.debug("AgentFS synced to disk", {
      synced: syncResult.synced,
      errors: syncResult.errors.length,
    });
  } catch (err) {
    logger.error("Failed to sync AgentFS to disk", {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      stdout: "",
      stderr: `Failed to sync AgentFS to disk: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  const result = await executeCommand(command, args, branchDir, timeout, logger);

  if (syncBackPatterns && syncBackPatterns.length > 0) {
    try {
      logger.debug("Syncing results back to AgentFS", { patterns: syncBackPatterns });
      const syncBackResult = await syncDiskToAgentFS(agent, branchDir, {
        include: syncBackPatterns,
      });
      logger.debug("Results synced back to AgentFS", {
        synced: syncBackResult.synced,
        errors: syncBackResult.errors.length,
      });
    } catch (err) {
      logger.warn("Failed to sync results back to AgentFS", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    await cleanupBranchDir(branchDir, logger);
  } catch (err) {
    logger.warn("Failed to cleanup branch directory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Files to preserve during cleanup (SQLite database files)
 */
const PRESERVED_FILES = new Set(["agent.db", "agent.db-wal", "agent.db-shm"]);

/**
 * Clean up the branch directory after command execution.
 * Removes all files except the SQLite database files.
 */
export async function cleanupBranchDir(
  branchDir: string,
  logger: ReturnType<typeof Logger.get>,
): Promise<void> {
  logger.debug("Cleaning up branch directory");

  let entries: string[];
  try {
    entries = await fs.readdir(branchDir);
  } catch (err) {
    logger.warn("Failed to read branch directory for cleanup", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let deletedCount = 0;
  let errorCount = 0;

  for (const entry of entries) {
    if (PRESERVED_FILES.has(entry)) {
      continue;
    }

    const fullPath = path.join(branchDir, entry);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
      deletedCount++;
    } catch (err) {
      errorCount++;
      logger.warn("Failed to delete entry during cleanup", {
        entry,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.debug("Branch directory cleanup completed", { deletedCount, errorCount });
}

/**
 * Execute a command in the specified directory
 */
function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  logger: ReturnType<typeof Logger.get>,
): Promise<RealBinaryExecResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const proc = spawn(command, args, {
      cwd,
      env: process.env,
      timeout,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;

      if (killed) {
        logger.warn("Command killed due to timeout", { duration, timeout });
      } else {
        logger.debug("Command completed", {
          exitCode: code,
          duration,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
        });
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? (killed ? 124 : 1),
      });
    });

    proc.on("error", (err) => {
      logger.error("Command execution failed", { error: err.message });

      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
      });
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");

      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, timeout);

    proc.on("close", () => {
      clearTimeout(timeoutId);
    });
  });
}
