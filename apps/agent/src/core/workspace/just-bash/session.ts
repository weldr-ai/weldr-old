import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";
import { agentfs } from "agentfs-sdk/just-bash";
import { createBashTool, type BashToolkit } from "bash-tool";
import { Bash } from "just-bash";

import { Logger } from "@weldr/shared/logger";

import { createBunCommand, createGitCommand } from "./commands";

// Workspace storage - keyed by snapshotId for snapshot-based isolation
const workspaces = new Map<string, WorkspaceSession>();

/**
 * Workspace with AgentFS backing.
 *
 * Provides:
 * - Virtual filesystem with 80+ bash commands (cat, ls, grep, etc.)
 * - Custom git and bun commands
 * - SQLite-backed session state storage
 * - Tool call tracking
 * - Metrics collection
 */
export interface WorkspaceSession {
  snapshotId: string;
  projectId: string;
  agent: AgentFS;
  bash: Bash;
  tools: BashToolkit;
}

export interface CreateWorkspaceOptions {
  snapshotId: string;
  projectId: string;
  workdir?: string;
}

/**
 * Create a new workspace with AgentFS backing
 */
export async function createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceSession> {
  const { snapshotId, projectId, workdir = "/workspace" } = options;
  const logger = Logger.get({ component: "workspace", snapshotId });

  // Check if session already exists (keyed by snapshotId for snapshot-based isolation)
  const existing = workspaces.get(snapshotId);
  if (existing) {
    logger.debug("Reusing existing workspace");
    return existing;
  }

  logger.info("Creating new workspace");

  // Ensure db directory exists and open AgentFS database
  const dbDir = path.join(os.homedir(), ".weldr", "db");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, `${snapshotId}.db`);
  const agent = await AgentFS.open({ path: dbPath });

  // Create just-bash compatible filesystem from AgentFS
  const fs = await agentfs(agent);

  // Ensure workdir exists in virtual FS
  try {
    await fs.mkdir(workdir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Create custom commands for external binaries
  const customCommands = [createGitCommand(), createBunCommand()];

  // Create Bash instance with AgentFS filesystem and custom commands
  const bash = new Bash({
    fs,
    cwd: workdir,
    customCommands,
  });

  // Create bash-tool toolkit
  const bashToolkit = await createBashTool({
    sandbox: bash,
    destination: workdir,
    extraInstructions:
      customCommands.length > 0
        ? `
      You also have access to the following commands:

      ${customCommands
        .map((command) => {
          if (command.name === "git") {
            return `- **git**: Full Git version control support. Use for cloning repositories, checking status, committing changes, branching, and all standard Git operations.`;
          }
          if (command.name === "bun") {
            return `- **bun**: Bun package manager and runtime. Use for installing dependencies (bun install), running scripts (bun run), executing TypeScript/JavaScript files, and managing packages.`;
          }
        })
        .join("\n\n")}
    `
        : undefined,
  });

  const session: WorkspaceSession = {
    snapshotId,
    projectId,
    agent,
    bash,
    tools: bashToolkit,
  };

  workspaces.set(snapshotId, session);
  logger.info("Workspace created successfully");

  return session;
}

/**
 * Get an existing workspace by snapshotId
 */
export function getWorkspace(snapshotId: string): WorkspaceSession | undefined {
  return workspaces.get(snapshotId);
}

/**
 * Close a workspace and cleanup resources
 */
export async function closeWorkspace(snapshotId: string): Promise<void> {
  const logger = Logger.get({ component: "workspace", snapshotId });
  const session = workspaces.get(snapshotId);

  if (!session) {
    logger.debug("No workspace to close");
    return;
  }

  logger.info("Closing workspace");

  try {
    await session.agent.close();
  } catch (error) {
    logger.error("Error closing AgentFS", { error: String(error) });
  }

  workspaces.delete(snapshotId);
  logger.info("Workspace closed");
}

/**
 * Get or create a workspace
 */
export async function getOrCreateWorkspace(
  options: CreateWorkspaceOptions,
): Promise<WorkspaceSession> {
  const existing = getWorkspace(options.snapshotId);
  if (existing) {
    return existing;
  }
  return createWorkspace(options);
}
