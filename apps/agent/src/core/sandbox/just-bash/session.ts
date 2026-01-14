import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";
import { agentfs } from "agentfs-sdk/just-bash";
import { createBashTool } from "bash-tool";
import { Bash } from "just-bash";

import { Logger } from "@weldr/shared/logger";

import {
  type AgentFSMetricsCollector,
  createAgentFSMetricsCollector,
} from "../../metrics/agentfs-collector";
import {
  createAgentFSStorage,
  type AgentFSSessionStorage,
} from "../../persistence/agentfs-storage";
import { createToolTracker, type ToolTracker } from "../../persistence/tool-tracker";
import { createBunCommand, createGitCommand } from "./commands";

// Sandbox session storage
const sessions = new Map<string, SandboxSession>();

/**
 * Sandbox session with AgentFS backing.
 *
 * Provides:
 * - Virtual filesystem with 80+ bash commands (cat, ls, grep, etc.)
 * - Custom git and bun commands
 * - SQLite-backed session state storage
 * - Tool call tracking
 * - Metrics collection
 */
export interface SandboxSession {
  branchId: string;
  projectId: string;
  versionId: string;
  agent: AgentFS;
  bash: Bash;
  tools: Awaited<ReturnType<typeof createBashTool>>["tools"];
  storage: AgentFSSessionStorage;
  metrics: AgentFSMetricsCollector;
  toolTracker: ToolTracker;
}

export interface CreateSessionOptions {
  branchId: string;
  projectId: string;
  versionId: string;
  workdir?: string;
}

/**
 * Create a new sandbox session with AgentFS backing
 */
export async function createSession(options: CreateSessionOptions): Promise<SandboxSession> {
  const { branchId, projectId, versionId, workdir = "/home/user/project" } = options;
  const logger = Logger.get({ component: "sandbox-session", branchId });

  // Check if session already exists
  const existing = sessions.get(branchId);
  if (existing) {
    logger.debug("Reusing existing sandbox session");
    return existing;
  }

  logger.info("Creating new sandbox session");

  // Ensure db directory exists and open AgentFS database
  const dbDir = path.join(os.homedir(), ".weldr", "db");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, `${branchId}.db`);
  const agent = await AgentFS.open({ path: dbPath });

  // Create SQLite-backed storage and metrics
  const storage = createAgentFSStorage(agent, versionId);
  const metrics = await createAgentFSMetricsCollector(agent);
  const toolTracker = createToolTracker(agent);

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
  });

  const session: SandboxSession = {
    branchId,
    projectId,
    versionId,
    agent,
    bash,
    tools: bashToolkit.tools,
    storage,
    metrics,
    toolTracker,
  };

  sessions.set(branchId, session);
  logger.info("Sandbox session created successfully");

  return session;
}

/**
 * Get an existing sandbox session by branchId
 */
export function getSession(branchId: string): SandboxSession | undefined {
  return sessions.get(branchId);
}

/**
 * Close a sandbox session and cleanup resources
 */
export async function closeSession(branchId: string): Promise<void> {
  const logger = Logger.get({ component: "sandbox-session", branchId });
  const session = sessions.get(branchId);

  if (!session) {
    logger.debug("No sandbox session to close");
    return;
  }

  logger.info("Closing sandbox session");

  try {
    await session.agent.close();
  } catch (error) {
    logger.error("Error closing AgentFS", { error: String(error) });
  }

  sessions.delete(branchId);
  logger.info("Sandbox session closed");
}

/**
 * Get or create a sandbox session
 */
export async function getOrCreateSession(options: CreateSessionOptions): Promise<SandboxSession> {
  const existing = getSession(options.branchId);
  if (existing) {
    return existing;
  }
  return createSession(options);
}
