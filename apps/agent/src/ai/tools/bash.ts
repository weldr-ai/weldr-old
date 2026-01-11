import { z } from "zod";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { type AgentFSBashTools, agentFSManager, createAgentFSBashTool } from "@/lib/storage";
import type { SessionContext } from "@/session";
import { createTool } from "./utils";

/**
 * Cache for bash tool instances per branch.
 * The underlying AgentFS connections are managed by agentFSManager.
 */
const bashToolCache = new Map<string, AgentFSBashTools>();

/**
 * Get or create a bash tool instance for a branch.
 * Uses AgentFSManager for connection lifecycle management.
 */
async function getOrCreateBashTool(projectId: string, branchId: string): Promise<AgentFSBashTools> {
  const cacheKey = `${projectId}:${branchId}`;

  const cached = bashToolCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const branchDir = getBranchDir(projectId, branchId);
  const agent = await agentFSManager.acquire(projectId, branchId, branchDir);

  const bashTools = await createAgentFSBashTool({
    agent,
    cwd: "/workspace",
    onBeforeBashCall: ({ command }) => {
      const logger = Logger.get({ projectId, branchId });
      logger.debug(`Executing bash command: ${command}`);
      return undefined;
    },
    onAfterBashCall: ({ command, result }) => {
      const logger = Logger.get({ projectId, branchId });
      logger.debug(`Bash command completed with exit code ${result.exitCode}`, {
        extra: { command, stdout: result.stdout.slice(0, 500) },
      });
      return undefined;
    },
  });

  bashToolCache.set(cacheKey, bashTools);
  return bashTools;
}

/**
 * Clear the bash tool cache for a branch.
 * Also releases the underlying AgentFS connection.
 */
export async function clearBashToolCache(projectId: string, branchId: string): Promise<void> {
  const cacheKey = `${projectId}:${branchId}`;
  if (bashToolCache.has(cacheKey)) {
    bashToolCache.delete(cacheKey);
    await agentFSManager.release(projectId, branchId);
  }
}

/**
 * Bash tool for AI agents.
 *
 * This tool provides a sandboxed bash environment backed by AgentFS.
 * The agent can execute any bash command (grep, find, cat, ls, etc.)
 * in a secure TypeScript-based bash implementation.
 *
 * All file operations are persisted to AgentFS (SQLite-backed),
 * enabling versioning and snapshots.
 *
 * Supported commands include:
 * - File operations: cat, cp, ls, mkdir, mv, rm, touch, tree
 * - Text processing: grep, sed, awk, head, tail, wc, sort, uniq, cut
 * - Search: find, grep (with regex support)
 * - Compression: gzip, gunzip
 * - Data processing: jq, yq
 * - And many more standard Unix utilities
 *
 * File changes are detected via git during session finalization,
 * so there's no need to track modifications inline.
 */
export const bashTool = createTool({
  name: "bash",
  description: `Execute bash commands in the project's sandboxed environment. Use this for file exploration, text search, data processing, and any shell operations. Commands run in a TypeScript-based bash with full support for pipes, redirections, variables, and common utilities (grep, find, awk, sed, jq, etc.).

Use this tool when you need to:
- Search for patterns in files (grep, find)
- Explore directory structure (ls, tree, find)
- Process text or data (awk, sed, jq, cut, sort)
- View file contents (cat, head, tail)
- Count lines/words/characters (wc)
- Any other shell operation

Prefer this over specialized tools when you need flexibility or when combining multiple operations with pipes.`,
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The bash command to execute. Supports pipes (|), redirections (>, >>), command chaining (&&, ||, ;), variables, and standard Unix utilities.",
      ),
  }),
  outputSchema: z.object({
    stdout: z.string().describe("Standard output from the command"),
    stderr: z.string().describe("Standard error from the command"),
    exitCode: z.number().describe("Exit code of the command (0 = success)"),
  }),
  execute: async ({ input, context }) => {
    const { command } = input;
    const project = context.project;
    const branch = context.branch;

    const logger = Logger.get({
      projectId: project.id,
      versionId: branch.headVersion.id,
    });

    logger.info("Executing bash command", {
      extra: { command: command.slice(0, 200) },
    });

    try {
      const bashTools = await getOrCreateBashTool(project.id, branch.id);
      const result = await bashTools.exec(command);

      logger.info("Bash command completed", {
        extra: {
          exitCode: result.exitCode,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        },
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (error) {
      logger.error("Failed to execute bash command", {
        extra: {
          command,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : "Failed to execute command",
        exitCode: 1,
      };
    }
  },
});

/**
 * Get the bash tools instance for direct access.
 * This can be used for operations that need direct access to the sandbox.
 */
export async function getBashTools(context: SessionContext): Promise<AgentFSBashTools> {
  const project = context.project;
  const branch = context.branch;
  return getOrCreateBashTool(project.id, branch.id);
}
