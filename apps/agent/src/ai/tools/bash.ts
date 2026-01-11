import { Logger } from "@weldr/shared/logger";
import { getBranchDir } from "@weldr/shared/state";

import { type SandboxBashTools, createSandboxBashTools, sandboxConnections } from "@/lib/sandbox";

/**
 * Cache for bash tool instances per branch.
 * The underlying sandbox connections are managed by sandboxConnections.
 */
const bashToolCache = new Map<string, SandboxBashTools>();

/**
 * Get or create a bash tool instance for a branch.
 * Uses sandboxConnections for connection lifecycle management.
 */
export async function getOrCreateBashTool(
  projectId: string,
  branchId: string,
): Promise<SandboxBashTools> {
  const cacheKey = `${projectId}:${branchId}`;

  const cached = bashToolCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const branchDir = getBranchDir(projectId, branchId);
  const agent = await sandboxConnections.acquire(projectId, branchId, branchDir);

  const bashTools = await createSandboxBashTools({
    agent,
    cwd: "/workspace",
    branchDir,
    onBeforeBashCall: ({ command }: { command: string }) => {
      const logger = Logger.get({ projectId, branchId });
      logger.debug(`Executing bash command: ${command}`);
      return undefined;
    },
    onAfterBashCall: ({
      command,
      result,
    }: {
      command: string;
      result: { exitCode: number; stdout: string };
    }) => {
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
 * Also releases the underlying sandbox connection.
 */
export async function clearBashToolCache(projectId: string, branchId: string): Promise<void> {
  const cacheKey = `${projectId}:${branchId}`;
  if (bashToolCache.has(cacheKey)) {
    bashToolCache.delete(cacheKey);
    await sandboxConnections.release(projectId, branchId);
  }
}
