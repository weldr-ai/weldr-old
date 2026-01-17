/**
 * AgentFS Session Management & Command Execution
 *
 * Session initialization, existence checks, and command execution using AgentFS SDK + just-bash.
 * Databases are stored in ~/.weldr/db/{snapshotId}.db - each snapshot has its own isolated DB.
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
  snapshotId: string;
}

/**
 * Get the path to the AgentFS database for a snapshot.
 * Each snapshot has its own isolated DB file.
 */
export function getSessionDbPath(snapshotId: string): string {
  return path.join(WELDR_DB_DIR, `${snapshotId}.db`);
}

/**
 * Initialize an AgentFS session for a snapshot.
 * Creates the ~/.weldr/db/{snapshotId}.db database if it doesn't exist.
 */
export async function initSession(snapshotId: string): Promise<void> {
  const logger = Logger.get({ component: "sandbox", snapshotId });

  logger.info("Initializing AgentFS session");

  // Ensure the db directory exists
  if (!existsSync(WELDR_DB_DIR)) {
    mkdirSync(WELDR_DB_DIR, { recursive: true });
  }

  const dbPath = getSessionDbPath(snapshotId);

  // Open (creates if doesn't exist) and close to initialize the database
  const agent = await AgentFS.open({ path: dbPath });
  await agent.close();

  logger.info("AgentFS session initialized");
}

/**
 * Check if an AgentFS session exists for a snapshot.
 */
export function sessionExists(snapshotId: string): boolean {
  return existsSync(getSessionDbPath(snapshotId));
}

/**
 * Execute a command in the sandbox using just-bash.
 * Commands run in the virtual filesystem backed by AgentFS.
 */
export async function exec(command: string, options: ExecOptions): Promise<ExecResult> {
  const { projectId, branchId, snapshotId } = options;

  const session = await getOrCreateSession({
    projectId,
    branchId,
    snapshotId,
  });

  const result = await session.bash.exec(command);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}
