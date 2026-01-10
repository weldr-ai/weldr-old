import * as path from "node:path";

import { z } from "zod";

import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { type AgentFSBashTools, agentFSManager, createAgentFSBashTool } from "@/lib/storage";
import type { SessionContext } from "@/session";
import { trackFileChange } from "../utils/extract-changed-files";
import { createTool } from "./utils";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"]);
const WORKSPACE_ROOT = "/workspace";
const WORKSPACE_PREFIX = "workspace/";

/**
 * Extract all regex matches from a string.
 */
function getAllMatches(pattern: RegExp, text: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  let match = pattern.exec(text);
  while (match !== null) {
    matches.push(match);
    match = pattern.exec(text);
  }
  return matches;
}

/**
 * Extract file paths that are being modified from a bash command.
 * Returns paths that are targets of write operations.
 */
function extractModifiedFiles(command: string): string[] {
  const files: string[] = [];

  // Match output redirections: > file, >> file
  const redirectMatches = getAllMatches(/(?:>>?)\s*["']?([^\s"'|;&]+)["']?/g, command);
  for (const match of redirectMatches) {
    if (match[1]) files.push(match[1]);
  }

  // Match tee command: tee file, tee -a file
  const teeMatches = getAllMatches(/\btee\s+(?:-a\s+)?["']?([^\s"'|;&]+)["']?/g, command);
  for (const match of teeMatches) {
    if (match[1]) files.push(match[1]);
  }

  // Match touch command: touch file1 file2
  const touchMatches = getAllMatches(/\btouch\s+((?:["']?[^\s"'|;&]+["']?\s*)+)/g, command);
  for (const match of touchMatches) {
    if (match[1]) {
      const touchFiles = match[1].trim().split(/\s+/);
      files.push(...touchFiles.map((f) => f.replace(/["']/g, "")));
    }
  }

  // Match cp command: cp source dest (last arg is destination)
  const cpMatches = getAllMatches(/\bcp\s+(?:-[a-zA-Z]+\s+)*(.+)/g, command);
  for (const match of cpMatches) {
    if (match[1]) {
      const args = match[1].trim().split(/\s+/);
      if (args.length >= 2) {
        const dest = args[args.length - 1];
        if (dest) files.push(dest.replace(/["']/g, ""));
      }
    }
  }

  // Match mv command: mv source dest (last arg is destination)
  const mvMatches = getAllMatches(/\bmv\s+(?:-[a-zA-Z]+\s+)*(.+)/g, command);
  for (const match of mvMatches) {
    if (match[1]) {
      const args = match[1].trim().split(/\s+/);
      if (args.length >= 2) {
        const dest = args[args.length - 1];
        if (dest) files.push(dest.replace(/["']/g, ""));
      }
    }
  }

  // Match sed -i: sed -i 's/...' file
  const sedMatches = getAllMatches(
    /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s+).*?\s+["']?([^\s"'|;&]+)["']?$/g,
    command,
  );
  for (const match of sedMatches) {
    if (match[1]) files.push(match[1]);
  }

  // Filter to only include code files and normalize paths
  return files
    .map((filePath) => {
      const trimmed = filePath.replace(/^\/+/, "");
      if (filePath.startsWith(`${WORKSPACE_ROOT}/`)) {
        return trimmed.slice(WORKSPACE_PREFIX.length);
      }
      return trimmed;
    })
    .filter((filePath) => CODE_EXTENSIONS.has(path.extname(filePath)));
}

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

      // Track modified files for incremental declaration extraction
      if (result.exitCode === 0) {
        const modifiedFiles = extractModifiedFiles(command);
        for (const filePath of modifiedFiles) {
          await trackFileChange({
            context,
            filePath,
            type: "modified",
          });
        }
        if (modifiedFiles.length > 0) {
          logger.debug("Tracked file changes", {
            extra: { files: modifiedFiles },
          });
        }
      }

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
