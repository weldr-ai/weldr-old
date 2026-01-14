/**
 * AgentFS Session Management & Command Execution
 *
 * Session initialization, existence checks, and command execution using AgentFS SDK + just-bash.
 * Databases are stored in ~/.weldr/db/{branchId}.db
 */

import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import { Logger } from "@weldr/shared/logger";

import { getOrCreateSession } from "./just-bash/session";

const WELDR_DB_DIR = path.join(os.homedir(), ".weldr", "db");

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  projectId: string;
  branchId: string;
}

/**
 * Get the path to the AgentFS database for a branch.
 */
export function getSessionDbPath(branchId: string): string {
  return path.join(WELDR_DB_DIR, `${branchId}.db`);
}

/**
 * Initialize an AgentFS session for a branch.
 * Creates the ~/.weldr/db/{branchId}.db database if it doesn't exist.
 */
export async function initSession(branchId: string): Promise<void> {
  const logger = Logger.get({ component: "sandbox", branchId });

  logger.info("Initializing AgentFS session");

  // Ensure the db directory exists
  if (!existsSync(WELDR_DB_DIR)) {
    mkdirSync(WELDR_DB_DIR, { recursive: true });
  }

  const dbPath = getSessionDbPath(branchId);

  // Open (creates if doesn't exist) and close to initialize the database
  const agent = await AgentFS.open({ path: dbPath });
  await agent.close();

  logger.info("AgentFS session initialized");
}

/**
 * Check if an AgentFS session exists for a branch.
 */
export function sessionExists(branchId: string): boolean {
  return existsSync(getSessionDbPath(branchId));
}

/**
 * Execute a command in the sandbox using just-bash.
 * Commands run in the virtual filesystem backed by AgentFS.
 */
export async function exec(command: string, options: ExecOptions): Promise<ExecResult> {
  const { projectId, branchId } = options;

  const session = await getOrCreateSession({
    projectId,
    branchId,
    versionId: "exec", // Placeholder for standalone exec calls
  });

  const result = await session.bash.exec(command);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}
