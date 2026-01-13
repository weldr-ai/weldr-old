/**
 * Executor - Command execution via AgentFS CLI
 *
 * All commands are executed through `agentfs run` which provides:
 * - FUSE-based copy-on-write filesystem isolation
 * - Session persistence (files stored in .agentfs/{branchId}.db)
 * - Transparent file access for all commands
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { Logger } from "@weldr/shared/logger";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  projectId: string;
  branchId: string;
  timeout?: number;
}

const BUN_INSTALL_CACHE_DIR = "/tmp/bun-cache";
const AGENTFS_CLI = path.join(os.homedir(), ".cargo", "bin", "agentfs");
const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const WELDR_HOME = path.join(os.homedir(), ".weldr");

export function getWorkdir(branchId: string): string {
  return path.join(WELDR_HOME, branchId);
}

function filterAgentfsNoise(stderr: string): string {
  return stderr
    .split("\n")
    .filter(
      (line) =>
        !line.includes("Welcome to AgentFS") &&
        !line.includes("directories are writable") &&
        !line.includes("Everything else is read-only") &&
        !line.includes("To join this session") &&
        !line.includes("agentfs run --session") &&
        !line.includes("Delta layer saved") &&
        !line.includes("To see what changed") &&
        !line.includes("agentfs diff") &&
        !line.includes("Joining existing session") &&
        !line.trim().startsWith("- /") &&
        !line.trim().startsWith("//"),
    )
    .join("\n")
    .trim();
}

/**
 * Execute a command via agentfs CLI.
 * All commands run inside the FUSE sandbox with copy-on-write isolation.
 * Commands run in ~/.weldr/{branchId} which is writable inside agentfs.
 */
export function exec(command: string, options: ExecOptions): ExecResult {
  const { branchId, timeout = DEFAULT_TIMEOUT } = options;
  const logger = Logger.get({ component: "executor", branchId });

  const workdir = getWorkdir(branchId);
  const isGitCommand = command.trim().startsWith("git ");
  const isBunCommand = command.trim().startsWith("bun ");

  const envVars: string[] = [];

  if (isGitCommand) {
    envVars.push("GIT_TERMINAL_PROMPT=0");
  }

  if (isBunCommand) {
    envVars.push(`BUN_INSTALL_CACHE_DIR=${BUN_INSTALL_CACHE_DIR}`);
  }

  // Build the shell command: create workdir, cd into it, then run command with env vars
  const envPrefix = envVars.length > 0 ? `${envVars.join(" ")} ` : "";
  const shellCommand = `mkdir -p ${workdir} && cd ${workdir} && ${envPrefix}${command}`;

  const agentfsArgs = [
    "run",
    "--session",
    branchId,
    "--allow",
    "/tmp",
    "--allow",
    WELDR_HOME,
    "bash",
    "-c",
    shellCommand,
  ];

  logger.debug("Executing via agentfs run", { command });

  const startTime = Date.now();

  let result: SpawnSyncReturns<string>;

  try {
    result = spawnSync(AGENTFS_CLI, agentfsArgs, {
      env: {
        ...process.env,
        AGENTFS_QUIET: "1",
      },
      encoding: "utf-8",
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("exec spawn failed", { error: errorMessage });

    return {
      stdout: "",
      stderr: errorMessage,
      exitCode: 1,
    };
  }

  const duration = Date.now() - startTime;

  if (result.error) {
    logger.error("exec error", { error: result.error.message, duration });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || result.error.message,
      exitCode: result.status ?? 1,
    };
  }

  logger.debug("exec completed", { exitCode: result.status, duration });

  return {
    stdout: result.stdout || "",
    stderr: filterAgentfsNoise(result.stderr || ""),
    exitCode: result.status ?? 0,
  };
}

/**
 * Initialize an AgentFS session for a branch.
 * Creates the .agentfs/{branchId}.db database if it doesn't exist.
 */
export function initSession(branchId: string): ExecResult {
  const logger = Logger.get({ component: "executor", branchId });

  logger.info("Initializing agentfs session", { branchId });

  try {
    const result = spawnSync(AGENTFS_CLI, ["init", branchId], {
      env: {
        ...process.env,
        AGENTFS_QUIET: "1",
      },
      encoding: "utf-8",
      timeout: 30000,
    });

    if (result.error) {
      logger.error("Failed to initialize agentfs session", { error: result.error.message });
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || result.error.message,
        exitCode: result.status ?? 1,
      };
    }

    logger.info("AgentFS session initialized", { branchId });

    return {
      stdout: result.stdout || "",
      stderr: filterAgentfsNoise(result.stderr || ""),
      exitCode: result.status ?? 0,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to initialize agentfs session", { error: errorMessage });

    return {
      stdout: "",
      stderr: errorMessage,
      exitCode: 1,
    };
  }
}

/**
 * Check if an AgentFS session exists for a branch.
 */
export function sessionExists(branchId: string): boolean {
  const agentfsDir = path.join(os.homedir(), ".agentfs");
  const dbPath = path.join(agentfsDir, `${branchId}.db`);

  try {
    const fs = require("node:fs");
    fs.accessSync(dbPath);
    return true;
  } catch {
    return false;
  }
}
