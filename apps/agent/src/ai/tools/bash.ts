import type { Tool } from "ai";

import { Logger } from "@weldr/shared/logger";

import { type SandboxSession, getOrCreateSession, closeSession } from "@/core/sandbox/just-bash";

/**
 * Result of a bash command execution
 */
export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Bash tools type - compatible with ToolSet
 */
export type BashTools = Record<string, Tool>;

/**
 * Extended bash tools with access to sandbox and AgentFS SDK features
 */
export interface BashToolsWithSandbox {
  tools: BashTools;
  sandbox: SandboxSession;
}

/**
 * Options for creating bash tools
 */
export interface CreateBashToolsOptions {
  projectId: string;
  branchId: string;
  versionId: string;
  workdir?: string;
}

/**
 * Create bash tools for AI agents using just-bash with AgentFS SDK.
 *
 * This provides:
 * - 80+ built-in bash commands (cat, ls, grep, find, sed, awk, etc.)
 * - Custom git and bun commands (sync to temp dir, execute real binary, sync back)
 * - Persistent virtual filesystem backed by SQLite
 * - KV store for workflow state
 * - Tool call tracking persisted to SQLite
 * - Workflow snapshot storage in SQLite
 */
export async function createBashTools(
  options: CreateBashToolsOptions,
): Promise<BashToolsWithSandbox> {
  const { projectId, branchId, versionId, workdir = "/home/user/project" } = options;
  const logger = Logger.get({ projectId, branchId, component: "bash-tool" });

  logger.debug("Creating bash tools with just-bash and AgentFS SDK");

  const sandbox = await getOrCreateSession({
    branchId,
    projectId,
    versionId,
    workdir,
  });

  logger.debug("Sandbox session ready", {
    extra: { hasStorage: !!sandbox.storage, hasMetrics: !!sandbox.metrics },
  });

  return {
    tools: sandbox.tools,
    sandbox,
  };
}

/**
 * Get or create bash tools for a branch.
 * Returns just the tools map for backwards compatibility.
 *
 * @deprecated Use createBashTools with full options instead
 */
export async function getOrCreateBashTool(
  projectId: string,
  branchId: string,
  versionId?: string,
): Promise<BashTools> {
  const { tools } = await createBashTools({
    projectId,
    branchId,
    versionId: versionId ?? branchId,
  });
  return tools;
}

/**
 * Close a sandbox session and cleanup resources.
 * Should be called when the sandbox is no longer needed.
 */
export async function closeBashTools(branchId: string): Promise<void> {
  await closeSession(branchId);
}
